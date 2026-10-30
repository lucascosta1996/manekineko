// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuardTransient} from "@openzeppelin/contracts/utils/ReentrancyGuardTransient.sol";
import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import {TinctaEngine} from "./TinctaEngine.sol";
import {IVRFCoordinatorV2Plus} from "./vendor/chainlink-vrf-v2.5/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import {VRFV2PlusClient} from "./vendor/chainlink-vrf-v2.5/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

/// @title Tincta Rewards
/// @notice One ERC-721 address owns all Genesis and paid NFTs, votes and ETH liabilities.
/// Its immutable engine helper is created by this constructor. Neither contract
/// has a proxy, upgrade, arbitrary delegatecall, pause or replacement renderer.
/// Chainlink VRF is a disclosed external randomness extension to the TAS-1 model.
/// Reading order: append catalog, fund operating, seal, Genesis sellout, ballot,
/// mint, verified randomness, finalization, claims or perpetual refund exits.
contract TinctaRewards is ERC721, ReentrancyGuardTransient {
    using Checkpoints for Checkpoints.Trace208;
    struct Terms { uint256 supply; uint256 price; uint256 winners; uint256 duration; }
    struct Settings {
        address operator; address coordinator; bytes32 keyHash;
        uint16 confirmations; uint32 callbackGas; uint48 votingDelay; uint48 votingDuration;
        uint256 randomnessBudget; uint256 sponsorshipBudget;
    }
    struct Plan { bytes32 seasonId; string seasonName; string name; string color; string textColor; }
    struct Round {
        uint48 voteStart; uint48 saleStart; uint48 soldOutAt; uint48 entropyAt; uint48 finalizedAt;
        bool requested; bool subscriptionClosed;
        uint256 minted; uint256 refunded; uint256 revenue; uint256 subscription;
        uint256 requestId; uint256 word; uint256 counter;
        uint256 executionReserve; address executor; uint256 sponsorReserve;
        uint256 affiliateShare; uint256 qualified; uint256 growthWithdrawn; uint256 treasuryWithdrawn;
        uint256 prizesClaimed; uint256[10] winners;
    }
    struct Affiliate { address wallet; uint256 referrals; bool claimed; }
    struct Season { uint256 first; uint256 last; uint256 funded; uint256 eligible; uint256 claims; uint256 paid; }
    Settings public settings;
    uint256 private immutable identityChain;
    string public constant CONTRACT_VERSION = "tincta-rewards-1";
    TinctaEngine public immutable engine;
    string public constant ALGORITHM_VERSION = "unique-rank-v6";
    uint256 public constant GENESIS_SUPPLY = 1000;
    uint256 public constant GENESIS_MAX_MINTS_PER_WALLET = 2;
    uint256 public constant RANDOMNESS_TIMEOUT = 3 days;
    uint256 public constant EXECUTION_REWARD = 0.01 ether;
    // Seventeen low bits hold a 1-based serial up to 65,536. Global ERC-721 IDs
    // never collide, while engine retains each collection's local numbering.
    uint256 private constant SERIAL_BITS = 17;
    Plan[] private plans;
    mapping(uint256 => Round) private rounds;
    mapping(bytes32 => Season) public seasons;
    mapping(bytes32 => bytes32) private seasonNames;
    mapping(uint256 => mapping(address => uint256)) public primaryMints;
    mapping(uint256 => mapping(address => Checkpoints.Trace208)) private checkpoints;
    mapping(uint256 => mapping(uint256 => uint256)) public votes;
    mapping(uint256 => mapping(address => mapping(uint256 => bool))) public sourceVoted;
    // Genesis uses a per-token vote for the first ballot after sellout.
    // Transfers carry an unused vote, never renew it.
    mapping(uint256 => bool) public genesisVoted;
    mapping(address => uint256) public genesisUnusedVotes;
    mapping(uint256 => mapping(uint256 => Affiliate)) public affiliates;
    mapping(uint256 => mapping(address => uint256)) public affiliateId;
    mapping(uint256 => mapping(uint256 => bool)) public eligibilityUsed;
    mapping(uint256 => uint256) public requestCollection;
    mapping(uint256 => uint256) public awardRank;
    mapping(uint256 => address) public awardBeneficiary;
    mapping(uint256 => bool) public holderClaimed;
    mapping(address => bool) public lifetimeRewardUsed;
    uint256 public prepared;
    uint48 public genesisStartsAt;
    uint48 public genesisSoldOutAt;
    bool public catalogSealed;
    uint256 public operatingReserve;
    /// @notice Sum of all internal ETH buckets. Moving between buckets never
    /// reduces this number. Only a real payout or VRF funding reduces it.
    uint256 public accountedBalance;
    error InvalidConfiguration(); error Unauthorized(); error InvalidState();
    error InvalidAmount(); error NotEligible(); error AlreadyUsed(); error InvalidRecipient();
    error TransferFailed(); error InsufficientFunds(); error TransfersLocked();
    event CatalogAdded(uint256 indexed collectionId, bytes32 indexed seasonId, string name);
    event GenesisOpened(uint48 startsAt);
    event GenesisVoteOpened(uint48 voteStart, uint48 saleStart);
    event GenesisVoteCast(address indexed voter, uint256 choice, uint256[] tokenIds);
    event CollectionPrepared(uint256 indexed collectionId, uint48 voteStart, uint48 saleStart);
    event VoteCast(uint256 indexed collectionId, address indexed voter, uint256 choice, uint256 weight);
    event Minted(uint256 indexed collectionId, address indexed recipient, uint256 firstTokenId, uint256 quantity);
    event AffiliateEnrolled(uint256 indexed collectionId, uint256 indexed affiliate, address wallet);
    event RandomnessRequested(uint256 indexed collectionId, uint256 requestId);
    event RandomnessDeferred(uint256 indexed collectionId);
    event RandomnessReceived(uint256 indexed collectionId, uint256 requestId);
    event LateRandomnessIgnored(uint256 indexed collectionId, uint256 requestId);
    event DrawFinalized(uint256 indexed collectionId, uint256[10] winners);
    event DrawProgress(uint256 indexed collectionId, uint256 counter);
    event Paid(uint256 indexed collectionId, uint256 indexed tokenId, address indexed recipient, uint256 amount, uint8 kind);
    event Sponsored(uint256 indexed sourceTokenId, uint256 indexed targetTokenId, address indexed beneficiary);
    modifier onlyOperator() { if (msg.sender != settings.operator) revert Unauthorized(); _; }

    /// @notice The selected deployer is the immutable treasury operator. Prices,
    /// packages and time windows are fixed in code; there is no accelerated mode.
    constructor(address operator, uint256 randomnessBudget, uint256 sponsorshipBudget) ERC721("Tincta Rewards", "TINCTA") {
        if (block.chainid != 1 && block.chainid != 31337) revert InvalidConfiguration();
        address coordinator = 0xD7f86b4b8Cae7D942340FF628F82735b7a20893a;
        if (operator == address(0) || coordinator.code.length == 0 || randomnessBudget < 0.25 ether) revert InvalidConfiguration();
        settings = Settings(operator, coordinator,
            0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9,
            64, 200000, 60, 1 days, randomnessBudget, sponsorshipBudget);
        identityChain = block.chainid;
        engine = new TinctaEngine();
    }

    function appendCollections(Plan[] calldata batch) external onlyOperator {
        if (catalogSealed || batch.length == 0 || batch.length > 10 || plans.length + batch.length > 256) revert InvalidState();
        for (uint256 i; i < batch.length; ++i) {
            Plan calldata p = batch[i]; Season storage s = seasons[p.seasonId];
            engine.validateAppearance(p.seasonName,p.name,p.color,p.textColor);
            if (p.seasonId == bytes32(0) || (s.first != 0 && (s.last - s.first >= 9 || plans[plans.length-1].seasonId != p.seasonId ||
                seasonNames[p.seasonId] != keccak256(bytes(p.seasonName))))) revert InvalidConfiguration();
            plans.push(p); s.last = plans.length;
            if (s.first == 0) { s.first = s.last; seasonNames[p.seasonId] = keccak256(bytes(p.seasonName)); }
            emit CatalogAdded(plans.length,p.seasonId,p.name);
        }
    }
    /// @notice Opens an indefinite Genesis mint and reserves the first collection's
    /// operating budgets. Its ballot has no start time until Genesis sells out.
    function sealCatalog() external onlyOperator nonReentrant {
        if (catalogSealed || plans.length == 0) revert InvalidState();
        catalogSealed = true; genesisStartsAt = uint48(block.timestamp);
        _prepare(0);
        emit GenesisOpened(genesisStartsAt);
    }
    function catalogCount() external view returns (uint256) { return plans.length; }
    function collection(uint256 id) external view returns (Plan memory) { return plans[id-1]; }
    function round(uint256 id) external view returns (Round memory) { return rounds[id]; }
    function optionCount() external pure returns (uint256) { return 3; }
    function option(uint256 index) public pure returns (Terms memory) {
        if (index == 0) return Terms(1000, 0.01 ether, 6, 1 days);
        if (index == 1) return Terms(2000, 0.02 ether, 4, 1 days);
        if (index == 2) return Terms(1000, 0.01 ether, 10, 1 days);
        revert InvalidConfiguration();
    }
    function tokenId(uint256 id, uint256 serial) public view returns (uint256) {
        if (id > 256 || serial == 0 || serial > (id == 0 ? GENESIS_SUPPLY : 65536)) revert InvalidAmount();
        return (id << SERIAL_BITS) | serial;
    }
    function tokenLocation(uint256 token) public pure returns (uint256 id, uint256 serial) { return (token >> SERIAL_BITS, token & 131071); }
    function winningOption(uint256 id) public view returns (uint256 winner) {
        _paidRound(id); uint256 best;
        for (uint256 i; i < 3; ++i) if (votes[id][i] > best) { best = votes[id][i]; winner = i; }
    }
    /// @notice Voting ends at saleStart. The winning terms then remain fixed without a signature.
    function terms(uint256 id) public view returns (Terms memory) { return option(winningOption(id)); }
    function termsHash(uint256 id) public view returns (bytes32) { return keccak256(abi.encode(terms(id))); }
    function mintDeadline(uint256 id) public view returns (uint256) { uint256 start = rounds[id].saleStart; return start == 0 ? 0 : start + terms(id).duration; }
    function refundsAvailable(uint256 id) public view returns (bool) {
        if (id == 0 || rounds[id].saleStart == 0 || rounds[id].entropyAt != 0) return false;
        Round storage r = rounds[id];
        return r.soldOutAt == 0 ? block.timestamp >= mintDeadline(id) : block.timestamp >= r.soldOutAt + RANDOMNESS_TIMEOUT;
    }
    function fundOperating() external payable { operatingReserve += msg.value; accountedBalance += msg.value; }
    function preparationCost() public view returns (uint256) { return settings.randomnessBudget + settings.sponsorshipBudget + EXECUTION_REWARD; }
    /// @notice Permissionless next collection after the preceding outcome.
    /// The first ballot was already prepared by sealCatalog. Old refund reserves
    /// and unpaid claims are never used as operating capital.
    function prepareNext() external nonReentrant returns (uint256 id) {
        if (!catalogSealed || prepared == plans.length ||
            (rounds[prepared].finalizedAt == 0 && !refundsAvailable(prepared))) revert InvalidState();
        return _prepare(uint48(block.timestamp) + settings.votingDelay);
    }
    function _prepare(uint48 voteStart) private returns (uint256 id) {
        uint256 cost = preparationCost(); if (operatingReserve < cost) revert InsufficientFunds();
        operatingReserve -= cost; id = ++prepared; Round storage r = rounds[id];
        r.voteStart = voteStart; r.saleStart = voteStart == 0 ? 0 : voteStart + settings.votingDuration;
        r.executionReserve = EXECUTION_REWARD; r.sponsorReserve = settings.sponsorshipBudget;
        IVRFCoordinatorV2Plus c = IVRFCoordinatorV2Plus(settings.coordinator);
        r.subscription = c.createSubscription(); c.addConsumer(r.subscription,address(this));
        accountedBalance -= settings.randomnessBudget;
        c.fundSubscriptionWithNative{value:settings.randomnessBudget}(r.subscription);
        emit CollectionPrepared(id,r.voteStart,r.saleStart);
    }
    function withdrawOperating(uint256 amount) external onlyOperator nonReentrant {
        if (amount > operatingReserve) revert InsufficientFunds(); operatingReserve -= amount;
        _pay(0,0,payable(settings.operator),amount,6);
    }
    /// @notice Two lifetime primary mints per wallet, with no time limit.
    /// The final mint opens the first ballot; nothing opens it before sellout.
    function mintGenesis() external nonReentrant {
        Round storage r = rounds[0];
        if (!catalogSealed || r.minted == GENESIS_SUPPLY) revert InvalidState();
        if (primaryMints[0][msg.sender] >= GENESIS_MAX_MINTS_PER_WALLET) revert AlreadyUsed();
        ++primaryMints[0][msg.sender]; ++r.minted;
        if (r.minted == GENESIS_SUPPLY) {
            genesisSoldOutAt = uint48(block.timestamp);
            Round storage first = rounds[1];
            first.voteStart = genesisSoldOutAt;
            first.saleStart = first.voteStart + settings.votingDuration;
            emit GenesisVoteOpened(first.voteStart,first.saleStart);
        }
        _safeMint(msg.sender,r.minted);
        emit Minted(0,msg.sender,r.minted,1);
    }
    function votingPower(uint256 id, address wallet, uint256 source) public view returns (uint256) {
        Round storage r = rounds[id];
        if (id == 0 || r.voteStart == 0 || block.timestamp < r.voteStart) return 0;
        if (source == 0) return id == 1 && block.timestamp < r.saleStart ? genesisUnusedVotes[wallet] : 0;
        if (sourceVoted[id][wallet][source] || rounds[source].finalizedAt == 0 || rounds[source].finalizedAt >= r.voteStart) return 0;
        return checkpoints[source][wallet].upperLookup(r.voteStart-1);
    }
    /// @notice Each Genesis NFT votes once, for its current owner, in the first
    /// ballot only. Every Genesis NFT exists before it opens; duplicates revert the batch.
    function castGenesisVote(uint256 choice, uint256[] calldata tokens) external nonReentrant {
        Round storage first = _paidRound(1);
        if (block.timestamp < first.voteStart || block.timestamp >= first.saleStart || choice >= 3 ||
            tokens.length == 0 || tokens.length > GENESIS_SUPPLY) revert InvalidState();
        for (uint256 i; i < tokens.length; ++i) {
            uint256 token = tokens[i];
            if (token == 0 || token > GENESIS_SUPPLY || genesisVoted[token] || ownerOf(token) != msg.sender) revert NotEligible();
            genesisVoted[token] = true;
        }
        genesisUnusedVotes[msg.sender] -= tokens.length;
        votes[1][choice] += tokens.length;
        emit VoteCast(1,msg.sender,choice,tokens.length);
        emit GenesisVoteCast(msg.sender,choice,tokens);
    }
    /// @notice Later ballots retain snapshot voting for revealed paid NFTs.
    /// Genesis must use castGenesisVote so transfers cannot duplicate its vote.
    function castVote(uint256 id, uint256 choice, uint256[] calldata sources) external nonReentrant {
        Round storage r = _paidRound(id);
        if (block.timestamp < r.voteStart || block.timestamp >= r.saleStart || choice >= 3 || sources.length == 0 || sources.length > 16) revert InvalidState();
        uint256 weight;
        for (uint256 i; i < sources.length; ++i) {
            if (sources[i] == 0) revert NotEligible();
            uint256 units = votingPower(id,msg.sender,sources[i]); if (units == 0) revert NotEligible();
            sourceVoted[id][msg.sender][sources[i]] = true; weight += units;
        }
        votes[id][choice] += weight; emit VoteCast(id,msg.sender,choice,weight);
    }
    /// @notice Genesis holders may enroll in every collection and season.
    /// From collection two, revealed earlier paid NFTs also qualify. Eligibility
    /// is checked at enrollment; each NFT admits one wallet per target collection.
    function enrollAffiliate(uint256 id, uint256 slot, uint256 sourceToken) external nonReentrant {
        Round storage r = _paidRound(id);
        if (r.voteStart == 0 || block.timestamp < r.voteStart || block.timestamp >= r.saleStart || slot == 0 || slot > 10 ||
            affiliates[id][slot].wallet != address(0) || affiliateId[id][msg.sender] != 0) revert InvalidState();
        (uint256 source,) = tokenLocation(sourceToken);
        if (sourceToken == 0 || ownerOf(sourceToken) != msg.sender || eligibilityUsed[id][sourceToken]) revert NotEligible();
        if (source != 0 && (source >= id || rounds[source].finalizedAt == 0)) revert NotEligible();
        eligibilityUsed[id][sourceToken] = true;
        affiliateId[id][msg.sender] = slot; affiliates[id][slot].wallet = msg.sender;
        emit AffiliateEnrolled(id,slot,msg.sender);
    }
    function mint(uint256 id, address recipient, uint256 quantity, uint256 referral, bytes32 expectedTerms) external payable nonReentrant {
        if (expectedTerms != termsHash(id)) revert InvalidState();
        Terms memory t = terms(id); if (msg.value != t.price * quantity) revert InvalidAmount();
        if (referral != 0 && (affiliates[id][referral].wallet == address(0) || affiliates[id][referral].wallet == msg.sender || affiliates[id][referral].wallet == recipient)) revert NotEligible();
        accountedBalance += msg.value; _mintPaid(id,recipient,quantity,referral,t);
    }
    function _mintPaid(uint256 id, address recipient, uint256 quantity, uint256 referral, Terms memory t) private {
        Round storage r = _paidRound(id); _recipient(recipient);
        if (r.saleStart == 0 || block.timestamp < r.saleStart || block.timestamp >= r.saleStart + t.duration || quantity == 0 || quantity > 20 ||
            r.minted + quantity > t.supply || primaryMints[id][recipient] + quantity > 20) revert InvalidAmount();
        uint256 first = r.minted + 1; r.minted += quantity; r.revenue += t.price * quantity; primaryMints[id][recipient] += quantity;
        if (referral != 0) affiliates[id][referral].referrals += quantity;
        if (r.minted == t.supply) r.soldOutAt = uint48(block.timestamp);
        for (uint256 i; i < quantity; ++i) _safeMint(recipient,tokenId(id,first+i));
        if (r.minted == t.supply) {
            for (uint256 i = 1; i <= 10; ++i) if (affiliates[id][i].referrals != 0) ++r.qualified;
            if (r.qualified != 0) r.affiliateShare = (r.revenue / 10000 * 2000) / r.qualified;
            try this.requestOnSellout(id) {} catch { emit RandomnessDeferred(id); }
        }
        emit Minted(id,recipient,tokenId(id,first),quantity);
    }
    function fundRandomness(uint256 id) external payable nonReentrant {
        Round storage r = _paidRound(id);
        if (msg.value == 0 || r.subscriptionClosed || r.entropyAt != 0 || refundsAvailable(id)) revert InvalidState();
        IVRFCoordinatorV2Plus(settings.coordinator).fundSubscriptionWithNative{value:msg.value}(r.subscription);
    }
    function requestOnSellout(uint256 id) external { if (msg.sender != address(this)) revert Unauthorized(); _request(id); }
    function requestRandomness(uint256 id) external nonReentrant { _request(id); }
    function _request(uint256 id) private {
        Round storage r = _paidRound(id);
        if (r.soldOutAt == 0 || r.requested || refundsAvailable(id)) revert InvalidState();
        r.requested = true;
        uint256 request = IVRFCoordinatorV2Plus(settings.coordinator).requestRandomWords(VRFV2PlusClient.RandomWordsRequest({
            keyHash:settings.keyHash,subId:r.subscription,requestConfirmations:settings.confirmations,callbackGasLimit:settings.callbackGas,
            numWords:1,extraArgs:VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment:true}))
        }));
        if (requestCollection[request] != 0) revert InvalidState();
        requestCollection[request] = id; r.requestId = request; emit RandomnessRequested(id,request);
    }
    function rawFulfillRandomWords(uint256 request, uint256[] calldata words) external nonReentrant {
        if (msg.sender != settings.coordinator) revert Unauthorized();
        uint256 id = requestCollection[request]; Round storage r = _paidRound(id);
        if (!r.requested || r.requestId != request || r.entropyAt != 0 || words.length != 1) revert InvalidState();
        if (block.timestamp >= r.soldOutAt + RANDOMNESS_TIMEOUT) { emit LateRandomnessIgnored(id,request); return; }
        r.word = words[0]; r.entropyAt = uint48(block.timestamp); emit RandomnessReceived(id,request);
    }
    /// @notice Bounded rejection sampling, the same unique-rank-v6 algorithm. No rerolls.
    function finalizeDraw(uint256 id, uint256 attempts) external nonReentrant {
        Round storage r = _paidRound(id); Terms memory t = terms(id);
        if (r.entropyAt == 0 || r.finalizedAt != 0 || attempts == 0 || attempts > 8) revert InvalidState();
        for (uint256 i; i < attempts; ++i) {
            bytes32 candidate = keccak256(abi.encode(keccak256("TINCTA_REWARDS_DRAW"),r.word,identityChain,address(this),id,t.supply,r.counter++));
            (bool accepted,uint256[10] memory winners) = engine.tryWinners(candidate,t.supply,t.winners);
            if (!accepted) continue;
            r.winners = winners; r.finalizedAt = uint48(block.timestamp); r.executor = msg.sender;
            for (uint256 j; j < t.winners; ++j) awardRank[tokenId(id,winners[j])] = j+1;
            Season storage s = seasons[plans[id-1].seasonId]; s.funded += r.revenue / 10000 * 1000; s.eligible += r.minted;
            emit DrawFinalized(id,winners); return;
        }
        emit DrawProgress(id,r.counter);
    }
    function claimPrize(uint256 token, address payable recipient) external nonReentrant {
        (uint256 id,) = tokenLocation(token); Round storage r = _paidRound(id);
        if (awardRank[token] == 0 || awardBeneficiary[token] != address(0) || ownerOf(token) != msg.sender) revert NotEligible();
        awardBeneficiary[token] = msg.sender; ++r.prizesClaimed;
        _pay(id,token,recipient,r.revenue / 10000 * (6000 / terms(id).winners),0);
    }
    /// @notice Current holder receives the complete mint price and burns the NFT.
    /// There is no expiry or sweep of unclaimed refund principal.
    function refund(uint256 token, address payable recipient) external nonReentrant {
        (uint256 id,) = tokenLocation(token);
        if (!refundsAvailable(id) || ownerOf(token) != msg.sender) revert NotEligible();
        ++rounds[id].refunded; _burn(token); _pay(id,token,recipient,terms(id).price,1);
    }
    function claimAffiliate(uint256 id, address payable recipient) external nonReentrant {
        Round storage r = _paidRound(id); Affiliate storage a = affiliates[id][affiliateId[id][msg.sender]];
        if (r.finalizedAt == 0 || a.wallet != msg.sender || a.referrals == 0 || a.claimed) revert NotEligible();
        a.claimed = true; _pay(id,0,recipient,r.affiliateShare,2);
    }
    /// @notice The first floor(eligible NFTs / 20) claims share this season's pool.
    /// Every collection must first reveal or become refundable, even if claims remain unpaid.
    function holderSummary(bytes32 season) public view returns (bool unlocked, uint256 limit, uint256 reward) {
        Season storage s = seasons[season];
        if (!catalogSealed || s.first == 0) return (false,0,0);
        limit = s.eligible / 20; reward = limit == 0 ? 0 : s.funded / limit;
        for (uint256 i = s.first; i <= s.last; ++i) if (rounds[i].finalizedAt == 0 && !refundsAvailable(i)) return (false,limit,reward);
        return (true,limit,reward);
    }
    function claimHolder(uint256 token, address payable recipient) external nonReentrant {
        (uint256 id,) = tokenLocation(token);
        if (id == 0 || rounds[id].finalizedAt == 0 || holderClaimed[token] || ownerOf(token) != msg.sender) revert NotEligible();
        bytes32 season = plans[id-1].seasonId; Season storage s = seasons[season];
        (bool unlocked,uint256 limit,uint256 reward) = holderSummary(season);
        if (!unlocked || s.claims >= limit || reward == 0) revert InvalidState();
        holderClaimed[token] = true; ++s.claims; s.paid += reward; _pay(id,token,recipient,reward,3);
    }
    function fundSponsorship(uint256 id) external payable { _paidRound(id); rounds[id].sponsorReserve += msg.value; accountedBalance += msg.value; }
    /// @notice One sponsored NFT per winning holder's lifetime, on a later paid
    /// collection. Its full price moves from sponsorship into the sale reserves.
    function redeemSponsored(uint256 sourceToken, uint256 target) external nonReentrant returns (uint256 mintedToken) {
        (uint256 source,) = tokenLocation(sourceToken); Round storage r = _paidRound(target); Terms memory t = terms(target);
        if (awardBeneficiary[sourceToken] != msg.sender || lifetimeRewardUsed[msg.sender] || target <= source ||
            r.saleStart <= rounds[source].finalizedAt || r.sponsorReserve < t.price) revert NotEligible();
        lifetimeRewardUsed[msg.sender] = true; r.sponsorReserve -= t.price; mintedToken = tokenId(target,r.minted+1);
        _mintPaid(target,msg.sender,1,0,t); emit Sponsored(sourceToken,mintedToken,msg.sender);
    }
    /// @notice Withdraw only a named bucket, never arbitrary contract balance.
    /// kind 0 treasury (10%, or 30% when no affiliate qualifies),
    /// 1 affiliate division dust (zero when no affiliate qualifies), 2 unused sponsorship,
    /// 3 refunded collection's unused execution budget. Holder funds have no sweep.
    function withdrawBucket(uint256 id, uint8 kind, uint256 amount) external onlyOperator nonReentrant {
        Round storage r = _paidRound(id);
        if (kind < 2) {
            if (r.finalizedAt == 0) revert InvalidState();
            if (kind == 0) {
                uint256 allocation = r.revenue / 10000 * (r.qualified == 0 ? 3000 : 1000);
                if (amount > allocation - r.treasuryWithdrawn) revert InsufficientFunds(); r.treasuryWithdrawn += amount;
            } else {
                uint256 dust = r.qualified == 0 ? 0 : r.revenue / 10000 * 2000 - r.qualified * r.affiliateShare;
                if (amount > dust - r.growthWithdrawn) revert InsufficientFunds(); r.growthWithdrawn += amount;
            }
        } else if (kind == 2) {
            if (r.saleStart == 0 || (r.soldOutAt == 0 && block.timestamp < mintDeadline(id)) || amount > r.sponsorReserve) revert InvalidState(); r.sponsorReserve -= amount;
        } else if (kind == 3) {
            if (!refundsAvailable(id) || amount > r.executionReserve) revert InvalidState(); r.executionReserve -= amount;
        } else revert InvalidState();
        _pay(id,0,payable(settings.operator),amount,4);
    }
    function claimExecution(uint256 id, address payable recipient) external nonReentrant {
        Round storage r = _paidRound(id); if (r.executor != msg.sender) revert NotEligible();
        uint256 amount = r.executionReserve; r.executionReserve = 0; _pay(id,0,recipient,amount,5);
    }
    function recoverRandomness(uint256 id) external onlyOperator nonReentrant {
        Round storage r = _paidRound(id);
        if (r.subscriptionClosed || (r.entropyAt == 0 && !refundsAvailable(id))) revert InvalidState();
        r.subscriptionClosed = true; IVRFCoordinatorV2Plus(settings.coordinator).cancelSubscription(r.subscription,payable(settings.operator));
    }
    function combinationKey(uint256 id) public view returns (bytes32) {
        return keccak256(abi.encode(keccak256("TINCTA_REWARDS_PERMANENT_COMBINATION"),identityChain,address(this),id,plans[id-1].seasonId,terms(id).supply));
    }
    function combination(uint256 token) public view returns (uint256[4] memory numbers, uint256 code) {
        _requireOwned(token); (uint256 id,uint256 serial) = tokenLocation(token); if (id == 0) revert InvalidState();
        return engine.combination(serial,combinationKey(id));
    }
    function score(uint256 token) public view returns (uint256) {
        _requireOwned(token); (uint256 id,uint256 serial) = tokenLocation(token); Round storage r = _paidRound(id);
        if (r.finalizedAt == 0) revert InvalidState(); Terms memory t = terms(id);
        return engine.rank(serial,t.supply,r.winners,t.winners);
    }
    function tokenForCombination(uint256 id, uint256[4] calldata numbers) public view returns (uint256 token) {
        token = tokenId(id,engine.serialForNumbers(numbers,combinationKey(id),terms(id).supply)); _requireOwned(token);
    }
    function scoreCombination(uint256 id, uint256[4] calldata numbers) external view returns (uint256) { return score(tokenForCombination(id,numbers)); }
    function tokenURI(uint256 token) public view override returns (string memory) {
        _requireOwned(token); (uint256 id,uint256 serial) = tokenLocation(token);
        if (id == 0) return engine.genesisURI(serial);
        Plan memory p = plans[id-1]; (uint256[4] memory numbers,uint256 code) = combination(token);
        return engine.paidTokenURI(TinctaEngine.Appearance(p.seasonId,p.seasonName,p.name,p.color,p.textColor),serial,numbers,code);
    }
    function _paidRound(uint256 id) private view returns (Round storage r) {
        if (id == 0 || id > prepared) revert InvalidState(); return rounds[id];
    }
    function _recipient(address to) private view { if (to == address(0) || to == address(this) || to == settings.coordinator) revert InvalidRecipient(); }
    function _pay(uint256 id, uint256 token, address payable to, uint256 amount, uint8 kind) private {
        _recipient(to); if (amount == 0) revert InvalidAmount(); accountedBalance -= amount;
        (bool ok,) = to.call{value:amount}(""); if (!ok) revert TransferFailed();
        if (address(this).balance < accountedBalance) revert InsufficientFunds(); emit Paid(id,token,to,amount,kind);
    }
    function _update(address to, uint256 token, address auth) internal override returns (address previous) {
        if (to == address(this) || to == settings.coordinator) revert InvalidRecipient();
        (uint256 id,) = tokenLocation(token); address from = _ownerOf(token); Round storage r = rounds[id];
        if (id != 0 && from != address(0) && to != address(0) && r.soldOutAt != 0 && !refundsAvailable(id) &&
            (r.finalizedAt == 0 || (awardRank[token] != 0 && awardBeneficiary[token] == address(0)))) revert TransfersLocked();
        previous = super._update(to,token,auth);
        if (id == 0 && !genesisVoted[token]) {
            if (previous != address(0)) --genesisUnusedVotes[previous];
            if (to != address(0)) ++genesisUnusedVotes[to];
        }
        if (previous != address(0)) checkpoints[id][previous].push(uint48(block.timestamp),checkpoints[id][previous].latest()-1);
        if (to != address(0)) checkpoints[id][to].push(uint48(block.timestamp),checkpoints[id][to].latest()+1);
    }
}
