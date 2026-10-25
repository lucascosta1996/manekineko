// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ManekinekoV12Policy} from "./ManekinekoV12Policy.sol";
import {ManekinekoVotingV12} from "./ManekinekoVotingV12.sol";
import {ManekinekoHolderRewardsV13} from "./ManekinekoHolderRewardsV13.sol";
import {ManekinekoRendererV11} from "./ManekinekoRendererV11.sol";
import {IVRFCoordinatorV2Plus} from "./vendor/chainlink-vrf-v2.5/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import {VRFV2PlusClient} from "./vendor/chainlink-vrf-v2.5/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

/// @title A finite Ethereum NFT competition with one immutable VRF request and a configurable number of equally rewarded winning NFTs.
/// @notice Permanent ticket combinations and artwork are on-chain from mint; Chainlink VRF determines scores after sellout.
/// @dev Coordinator authentication is implemented here rather than inheriting the upstream consumer's
///      mutable coordinator/ownership API. Neither owner nor coordinator can replace this round's verifier.
contract ManekinekoRoundV13 is ERC721, ReentrancyGuard {

    struct Config {
        string name;
        string symbol;
        bytes32 seasonId;
        string seasonName;
        string collectionColor;
        string textColor;
        uint256 roundId;
        address operator;
        address voting;
        address holderRewards;
        address vrfCoordinator;
        bytes32 keyHash;
        uint16 requestConfirmations;
        uint32 callbackGasLimit;
        uint256 maxAffiliateSlots;
        uint256 saleStartAt;
    }

    enum Phase { PendingActivation, Minting, AwaitingRequest, AwaitingRandomness, AwaitingFinalization, AwaitingPrize, Complete, Refundable }

    uint256 public constant MAX_MINT_BATCH = 20;
    uint256 public constant MAX_MINTS_PER_WALLET = 20;
    /// @notice Lifetime primary mints received in this collection, including sponsored mints.
    /// @dev Independent of balanceOf: transfers and burns never restore mint allowance.
    mapping(address => uint256) public mintedPerWallet;
    error WalletMintLimitExceeded(address wallet, uint256 remaining);
    uint256 public constant MAX_DRAW_ATTEMPTS = 8;
    uint256 public constant RANDOMNESS_TIMEOUT = ManekinekoV12Policy.RANDOMNESS_TIMEOUT;
    /// @notice Separately funded ETH, never deducted from mint receipts. Reserved until paid/recovered.
    uint256 public executionReserve;
    address public executionRecipient;
    uint256 private constant BPS_DENOMINATOR = 10_000;
    string public constant CONTRACT_VERSION = "affiliate-v13";
    string public constant ALGORITHM_VERSION = "unique-rank-v6";
    // Provider and score descriptions live in the shared on-chain renderer metadata.
    bytes32 private constant DRAW_DOMAIN = keccak256("MANEKINEKO_MULTI_AWARD_RANK_V6");
    bytes32 private constant COMBINATION_DOMAIN = keccak256("MANEKINEKO_PERMANENT_COMBINATION_V1");

    /// @dev Stored once so even a later chain-id change cannot alter existing NFT metadata.
    uint256 private immutable identityChainId;
    address public immutable operator;
    ManekinekoVotingV12 public immutable voting;
    ManekinekoHolderRewardsV13 public immutable holderRewards;
    uint256 public constant holderPoolBps = 1000;
    uint256 public constant operatorBps = 1000;
    uint256 public operatorWithdrawn;
    uint256 public immutable roundId;
    bytes32 public immutable seasonId;
    string public seasonName;
    bytes7 private immutable backgroundHex;
    bool private immutable whiteText;
    IVRFCoordinatorV2Plus public immutable vrfCoordinator;
    bytes32 public immutable keyHash;
    uint256 public immutable subscriptionId;
    uint16 public immutable requestConfirmations;
    uint32 public immutable callbackGasLimit;

    uint256 public claimedAwardCount;
    uint256 public constant minAffiliateReferrals = 1;
    uint256 public immutable saleStartAt;
    uint256 public soldOutAt;
    uint256 public affiliateQualifiedCount;
    uint256 public affiliateEqualShare;
    uint256 public growthReserveWithdrawn;
    mapping(uint256 => uint256) public winningTokenIds;
    mapping(uint256 => bool) public prizeClaimed;
    mapping(uint256 => address) public awardHolder;
    mapping(uint256 => uint64) public awardPaidAt;
    uint256 public constant prizeBps = 6000;
    uint256 public constant affiliatePoolBps = 2000;
    uint256 public totalReferredMints;
    uint256 public immutable maxAffiliateSlots;
    ManekinekoRendererV11 public immutable renderer;
    uint256 public affiliateCount;
    mapping(uint256 => address) public affiliateWallet;
    mapping(address => uint256) public affiliateIdOf;
    mapping(uint256 => uint256) public affiliateReferredMints;
    mapping(uint256 => uint256) public affiliateAccrued;
    mapping(uint256 => uint256) public affiliateClaimed;
    uint256 public totalAffiliateAccrued;
    uint256 public totalAffiliateClaimed;

    uint256 public totalMinted;
    uint256 public totalMintRevenue;
    uint256 public totalRefunded;
    uint256 public refundedCount;
    bool public cancelled;
    bool public randomnessRequested;
    uint256 public requestId;
    bool public randomnessReceived;
    uint256 public randomWord;
    uint256 public drawCounter;
    bool public revealed;
    uint256 public drawOffset;
    uint256 public finalizedAt;
    uint256 public winningTokenId;
    uint256 public highestScore;
    bool public prizePaid;
    /// @notice Holder entitled to the winning reward at successful prize settlement, never the chosen payment recipient.
    address public winningHolder;
    /// @notice Actual successful settlement time, packed with winningHolder; reveal time does not establish a settled win.
    uint64 public prizePaidAt;
    address public prizeRecipient;
    uint256 public prizePaidAmount;
    bool public subscriptionClosed;

    error InvalidConfig();
    error EnrollmentClosed();
    error InvalidEnrollment();
    error AffiliateCapacityReached();
    error AffiliateAlreadyEnrolled();
    error AffiliatePositionUnavailable();
    error InvalidAffiliate();
    error SelfReferral();
    error AffiliateClaimUnavailable();
    error UnsupportedChain();
    error InvalidQuantity();
    error InvalidPayment(uint256 expected, uint256 received);
    error MintClosed();
    error InvalidPhase();
    error InvalidFunding();
    error SubscriptionNotReady();
    error OnlyCoordinator();
    error InvalidFulfillment();
    error RevealNotAvailable();
    error NotTokenHolder();
    error ClaimNotAvailable();
    error TransfersLocked();
    error InvalidRecipient();
    error TransferFailed();
    error InsufficientWithdrawableBalance();

    event AwardDetermined(uint256 indexed rank, uint256 indexed tokenId, uint256 score, uint256 amount);
    event AwardClaimed(uint256 indexed rank, uint256 indexed tokenId, address indexed holder, address recipient, uint256 amount);
    event AffiliateQualificationFinalized(uint256 qualifiedCount, uint256 equalShare, uint256 unallocatedPool);
    event GrowthReserveWithdrawn(address indexed recipient, uint256 amount);
    event AffiliateEnrolled(uint256 indexed id, address indexed wallet, uint256 poolBps, bytes32 nonce);
    event AffiliateReferralRecorded(uint256 indexed id, address indexed payer, address indexed recipient, uint256 firstTokenId, uint256 quantity);
    event AffiliatePoolAllocated(uint256 poolAmount, uint256 referredMints);
    event AffiliateCommissionClaimed(uint256 indexed id, address indexed wallet, address indexed recipient, uint256 amount);
    event SubscriptionPrepared(uint256 indexed subscriptionId, address indexed coordinator);
    event RandomnessFunded(address indexed payer, uint256 amount);
    event Minted(address indexed payer, address indexed recipient, uint256 indexed firstTokenId, uint256 quantity);
    event SoldOut(uint256 indexed roundId, uint256 mintRevenue);
    event RandomnessRequested(uint256 indexed requestId, uint256 indexed subscriptionId);
    event RandomnessReceived(uint256 indexed requestId, uint256 word);
    event DrawProgress(uint256 nextCounter);
    event WinnerDetermined(uint256 indexed tokenId, uint256 score, uint256 prize);
    event PrizeDelivered(uint256 indexed tokenId, address indexed holder, address indexed recipient, uint256 amount);
    event RoundCancelled(uint256 indexed roundId);
    event Refunded(uint256 indexed tokenId, address indexed holder, address indexed recipient, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    event RandomnessFundingWithdrawn(address indexed recipient);
    // ERC-4906 compatibility only: lifecycle events never change this version's metadata.
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    modifier onlyOwner() { if (msg.sender != operator) revert NotOperator(); _; }
    error NotOperator();
    error TermsChanged();
    event OperatorWithdrawn(address indexed operator, address indexed recipient, uint256 amount);
    event RandomnessRequestDeferred();
    event LateRandomnessIgnored(uint256 indexed requestId);
    event ExecutionFunded(address indexed funder, uint256 amount);
    event ExecutionRewardEarned(address indexed executor, uint256 amount);
    event ExecutionRewardPaid(address indexed recipient, uint256 amount);
    event ExecutionFundingRecovered(uint256 amount);

    constructor(Config memory config, address onchainRenderer) ERC721(config.name, config.symbol) {
        if (config.operator == address(0) || config.voting.code.length == 0 || config.roundId == 0 ||
            config.seasonId == bytes32(0) || config.saleStartAt <= block.timestamp ||
            config.maxAffiliateSlots == 0 || config.maxAffiliateSlots > 100 ||
            bytes(config.symbol).length == 0 || bytes(config.symbol).length > 16) revert InvalidConfig();
        renderer = ManekinekoRendererV11(onchainRenderer);
        renderer.validateAppearance(config.seasonName, config.name, config.collectionColor, config.textColor);
        // V12 has no admission signer. Pin the verifier and lane independently of the renderer.
        if (config.vrfCoordinator.code.length == 0 || config.keyHash == bytes32(0) ||
            config.requestConfirmations < 64 || config.requestConfirmations > 200 ||
            config.callbackGasLimit < 100_000 || config.callbackGasLimit > 2_500_000) revert InvalidConfig();
        if (block.chainid == 1) {
            if (config.vrfCoordinator != 0xD7f86b4b8Cae7D942340FF628F82735b7a20893a ||
                config.keyHash != 0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9) revert InvalidConfig();
        } else if (block.chainid == 11155111) {
            if (config.vrfCoordinator != 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B ||
                config.keyHash != 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae) revert InvalidConfig();
        } else if (block.chainid != 31337) revert UnsupportedChain();
        operator = config.operator;
        voting = ManekinekoVotingV12(config.voting);
        holderRewards = ManekinekoHolderRewardsV13(config.holderRewards);
        if (config.holderRewards.code.length == 0 || address(holderRewards.controller()) != voting.controller()) revert InvalidConfig();
        identityChainId = block.chainid;
        saleStartAt = config.saleStartAt;
        roundId = config.roundId;
        seasonId = config.seasonId;
        seasonName = config.seasonName;
        backgroundHex = bytes7(bytes(config.collectionColor));
        whiteText = keccak256(bytes(config.textColor)) == keccak256("#FFFFFF");
        maxAffiliateSlots = config.maxAffiliateSlots;
        vrfCoordinator = IVRFCoordinatorV2Plus(config.vrfCoordinator);
        keyHash = config.keyHash;
        requestConfirmations = config.requestConfirmations;
        callbackGasLimit = config.callbackGasLimit;
        uint256 id = vrfCoordinator.createSubscription();
        subscriptionId = id;
        vrfCoordinator.addConsumer(id, address(this));
        emit SubscriptionPrepared(id, config.vrfCoordinator);
    }

    function owner() external view returns (address) { return operator; }
    function maxSupply() public view returns (uint256) { return voting.effectiveTerms(address(this)).supply; }
    function mintPrice() public view returns (uint256) { return voting.effectiveTerms(address(this)).price; }
    function winnerCount() public view returns (uint256) { return voting.effectiveTerms(address(this)).winners; }
    function mintDeadline() public view returns (uint256) { return saleStartAt + voting.effectiveTerms(address(this)).duration; }
    function saleActivated() public view returns (bool) { return block.timestamp >= saleStartAt; }
    function termsHash() public view returns (bytes32) { return voting.termsHash(address(this)); }
    function permanentCombinationKey() private view returns (bytes32) {
        return keccak256(abi.encode(COMBINATION_DOMAIN, identityChainId, address(this), roundId, seasonId, maxSupply()));
    }

    /// @notice Anyone can fund the VRF subscription separately from ticket/prize funds.
    function fundRandomness() external payable nonReentrant {
        if (msg.value == 0 || subscriptionClosed || randomnessReceived || refundsAvailable()) revert InvalidFunding();
        vrfCoordinator.fundSubscriptionWithNative{value: msg.value}(subscriptionId);
        emit RandomnessFunded(msg.sender, msg.value);
    }

    function fundExecution() external payable nonReentrant {
        if (msg.value == 0 || revealed || refundsAvailable()) revert InvalidFunding();
        executionReserve += msg.value;
        emit ExecutionFunded(msg.sender, msg.value);
    }

    /// @notice Sellout fixes the cutoff even if the initial VRF request fails. Zero before sellout.
    function randomnessDeadline() public view returns (uint256) {
        return soldOutAt == 0 ? 0 : soldOutAt + RANDOMNESS_TIMEOUT;
    }

    /// @notice Enrollment is onchain throughout voting and closes exactly when minting opens.
    function enrollAffiliate(uint256 affiliateId, address sourceCollection, uint256 sourceTokenId) external nonReentrant {
        if (block.timestamp >= saleStartAt) revert EnrollmentClosed();
        if (affiliateIdOf[msg.sender] != 0) revert AffiliateAlreadyEnrolled();
        if (affiliateId == 0 || affiliateId > maxAffiliateSlots || affiliateWallet[affiliateId] != address(0)) revert AffiliatePositionUnavailable();
        voting.consumeEligibility(msg.sender, sourceCollection, sourceTokenId);
        ++affiliateCount;
        affiliateWallet[affiliateId] = msg.sender;
        affiliateIdOf[msg.sender] = affiliateId;
        emit AffiliateEnrolled(affiliateId, msg.sender, affiliatePoolBps, bytes32(0));
    }

    /// @notice Offers identify an exact slot. A competing enrollment never silently changes its rate.
    function nextAvailableAffiliateId() external view returns (uint256) {
        for (uint256 id = 1; id <= maxAffiliateSlots; ++id) {
            if (affiliateWallet[id] == address(0)) return id;
        }
        return 0;
    }

    /// @notice Remaining primary-mint allowance for this receiving wallet, across all callers and mint paths.
    function remainingMints(address wallet) public view returns (uint256) {
        return MAX_MINTS_PER_WALLET - mintedPerWallet[wallet];
    }

    function mint(address to, uint256 quantity) external payable nonReentrant {
        _mintTickets(to, quantity, 0);
    }

    function mintQuoted(address to, uint256 quantity, uint256 affiliateId, bytes32 expectedTerms) external payable nonReentrant {
        if (expectedTerms != termsHash()) revert TermsChanged();
        if (affiliateId != 0) {
            address affiliate = affiliateWallet[affiliateId];
            if (affiliate == address(0)) revert InvalidAffiliate();
            if (msg.sender == affiliate || to == affiliate) revert SelfReferral();
        }
        _mintTickets(to, quantity, affiliateId);
    }

    /// @notice A paid referral contributes to this affiliate’s share of the collection-wide pool at sellout.
    function mintWithAffiliate(address to, uint256 quantity, uint256 affiliateId) external payable nonReentrant {
        address affiliate = affiliateWallet[affiliateId];
        if (affiliate == address(0)) revert InvalidAffiliate();
        if (msg.sender == affiliate || to == affiliate) revert SelfReferral();
        _mintTickets(to, quantity, affiliateId);
    }

    function _mintTickets(address to, uint256 quantity, uint256 affiliateId) private {
        if (!saleActivated() || block.timestamp < saleStartAt || cancelled || soldOut() || block.timestamp >= mintDeadline()) revert MintClosed();
        _validateRecipient(to);
        if (quantity == 0 || quantity > MAX_MINT_BATCH || quantity > maxSupply() - totalMinted) revert InvalidQuantity();
        uint256 walletRemaining = remainingMints(to);
        if (quantity > walletRemaining) revert WalletMintLimitExceeded(to, walletRemaining);
        uint256 cost = mintPrice() * quantity;
        if (msg.value != cost) revert InvalidPayment(cost, msg.value);
        // Reserve the entire batch before ERC721 receiver callbacks.
        mintedPerWallet[to] += quantity;
        uint256 firstId = totalMinted + 1;
        totalMinted += quantity;
        totalMintRevenue += cost;
        if (affiliateId != 0) {
            affiliateReferredMints[affiliateId] += quantity;
            totalReferredMints += quantity;
            emit AffiliateReferralRecorded(affiliateId, msg.sender, to, firstId, quantity);
        }
        for (uint256 id = firstId; id < firstId + quantity; ++id) _safeMint(to, id);
        if (soldOut()) {
            soldOutAt = block.timestamp;
            _allocateAffiliatePool();
            emit SoldOut(roundId, totalMintRevenue);
            // A temporary oracle failure must not undo the final buyer's mint. Anyone can retry.
            try this.requestOnSellout() {} catch { emit RandomnessRequestDeferred(); }
        }
        emit Minted(msg.sender, to, firstId, quantity);
    }

    /// @notice Includes direct primary mints; excludes VRF funding and unsolicited ETH.
    function affiliatePoolAmount() public view returns (uint256) {
        return (totalMintRevenue / BPS_DENOMINATOR) * affiliatePoolBps;
    }

    function _qualifiedShare() private view returns (uint256 count, uint256 equalShare) {
        for (uint256 id = 1; id <= maxAffiliateSlots; ++id) {
            uint256 referred = affiliateReferredMints[id];
            if (affiliateWallet[id] != address(0) && referred >= minAffiliateReferrals) {
                ++count;
            }
        }
        if (count != 0) equalShare = affiliatePoolAmount() / count;
    }

    /// @dev Up to 100 slots; every affiliate with a paid referral gets an equal share of the full pool. Only division dust or a pool with no qualifiers remains in growth reserve.
    function _allocateAffiliatePool() private {
        (uint256 count, uint256 equalShare) = _qualifiedShare();
        affiliateQualifiedCount = count;
        affiliateEqualShare = equalShare;
        for (uint256 id = 1; id <= maxAffiliateSlots; ++id) {
            if (affiliateWallet[id] != address(0) && affiliateReferredMints[id] >= minAffiliateReferrals)
                affiliateAccrued[id] = equalShare;
        }
        totalAffiliateAccrued = count * equalShare;
        emit AffiliatePoolAllocated(totalAffiliateAccrued, totalReferredMints);
        emit AffiliateQualificationFinalized(count, equalShare, unallocatedAffiliatePool());
    }

    /// @notice Undistributed affiliate budget, separately accounted rather than counted as operator earnings.
    function unallocatedAffiliatePool() public view returns (uint256) {
        return soldOut() ? affiliatePoolAmount() - totalAffiliateAccrued : 0;
    }

    function growthReserveBalance() public view returns (uint256) {
        return unallocatedAffiliatePool() - growthReserveWithdrawn;
    }

    /// @notice Explicit treasury withdrawal; never withdraws any affiliate entitlement or any NFT prize.
    function withdrawGrowthReserve(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        _validateRecipient(recipient);
        if (!revealed || amount == 0 || amount > growthReserveBalance()) revert InsufficientWithdrawableBalance();
        growthReserveWithdrawn += amount;
        _send(recipient, amount);
        emit GrowthReserveWithdrawn(recipient, amount);
    }

    /// @notice Shares are calculated at sellout, but vest only after successful draw finalization.
    function affiliateClaimable(uint256 affiliateId) public view returns (uint256) {
        if (!revealed) return 0;
        return affiliateAccrued[affiliateId] - affiliateClaimed[affiliateId];
    }

    /// @notice Withdraw your earned balance to a chosen recipient without depending on prize delivery.
    function claimAffiliateCommission(address payable recipient) external nonReentrant {
        _validateRecipient(recipient);
        uint256 id = affiliateIdOf[msg.sender];
        uint256 amount = affiliateClaimable(id);
        if (id == 0 || amount == 0) revert AffiliateClaimUnavailable();
        affiliateClaimed[id] += amount;
        totalAffiliateClaimed += amount;
        _send(recipient, amount);
        emit AffiliateCommissionClaimed(id, msg.sender, recipient, amount);
    }

    /// @notice Permissionless single request after sales are irrevocably closed.
    /// @dev A reverted request creates no on-chain request; retrying that failure is safe.
    function requestOnSellout() external {
        if (msg.sender != address(this)) revert InvalidPhase();
        _requestRandomness();
    }
    function requestRandomness() external nonReentrant returns (uint256) { return _requestRandomness(); }
    function _requestRandomness() private returns (uint256 id) {
        if (!soldOut() || refundsAvailable() || randomnessRequested) revert InvalidPhase();
        randomnessRequested = true;
        id = vrfCoordinator.requestRandomWords(VRFV2PlusClient.RandomWordsRequest({
            keyHash: keyHash,
            subId: subscriptionId,
            requestConfirmations: requestConfirmations,
            callbackGasLimit: callbackGasLimit,
            numWords: 1,
            extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: true}))
        }));
        requestId = id;
        emit RandomnessRequested(id, subscriptionId);
    }

    /// @dev Called only by the immutable proof-verifying coordinator. Valid fulfillment has no external calls,
    ///      arithmetic sampling, NFT iteration, or payment. Zero is a valid random word.
    function rawFulfillRandomWords(uint256 id, uint256[] calldata words) external nonReentrant {
        if (msg.sender != address(vrfCoordinator)) revert OnlyCoordinator();
        if (!randomnessRequested || id != requestId || randomnessReceived || words.length != 1) revert InvalidFulfillment();
        // Timestamp decides the outcome, not whether a refund/cancel transaction won a race.
        // A late callback cannot revive this collection or erase an already available refund.
        if (block.timestamp >= randomnessDeadline()) {
            emit LateRandomnessIgnored(id);
            return;
        }
        randomWord = words[0];
        randomnessReceived = true;
        emit RandomnessReceived(id, words[0]);
    }

    /// @notice Finish the unique ranking with bounded deterministic work; every caller follows the same stream.
    /// @dev Keccak expansion uses a cryptographic assumption, not new independent information-theoretic entropy.
    function canFinalizeDraw() external view returns (bool) {
        if (!randomnessReceived || revealed) return false;
        for (uint256 i; i < MAX_DRAW_ATTEMPTS; ++i) {
            (bool accepted,) = _drawCandidate(drawCounter + i);
            if (accepted) return true;
        }
        return false;
    }
    function _drawCandidate(uint256 counter) private view returns (bool, uint256[10] memory) {
        bytes32 candidate = keccak256(abi.encode(DRAW_DOMAIN, randomWord, block.chainid, address(this), roundId, maxSupply(), counter));
        return renderer.drawWinners(candidate, maxSupply(), winnerCount());
    }
    function finalizeDraw(uint256 attempts) external nonReentrant {
        _finalizeDraw(attempts);
    }
    /// @notice Public executors can complete the draw and collect separate operating ETH in one call.
    /// A rejecting payment recipient may revert this convenience call; finalizeDraw always remains available.
    function finalizeDrawAndClaim(address payable recipient) external nonReentrant {
        _validateRecipient(recipient);
        _finalizeDraw(MAX_DRAW_ATTEMPTS);
        if (revealed) _claimExecutionReward(recipient);
    }
    function _finalizeDraw(uint256 attempts) private {
        if (!randomnessReceived || revealed) revert InvalidPhase();
        if (attempts == 0 || attempts > MAX_DRAW_ATTEMPTS) revert InvalidQuantity();
        uint256 counter = drawCounter;
        for (uint256 i; i < attempts; ++i) {
            (bool accepted, uint256[10] memory winners) = _drawCandidate(counter);
            ++counter;
            if (accepted) {
                drawCounter = counter;
                winningTokenId = winners[0];
                for (uint256 rank = 1; rank <= winnerCount(); ++rank) winningTokenIds[rank] = winners[rank - 1];
                highestScore = maxSupply();
                finalizedAt = block.timestamp;
                revealed = true;
                holderRewards.fund{value: (totalMintRevenue / BPS_DENOMINATOR) * holderPoolBps}();
                executionRecipient = msg.sender == voting.controller() ? operator : msg.sender;
                emit ExecutionRewardEarned(executionRecipient, executionReserve);
                emit WinnerDetermined(winningTokenId, highestScore, prizeAmountForRank(1));
                uint256 amount = prizeAmountForRank(1);
                for (uint256 rank = 1; rank <= winnerCount(); ++rank)
                    emit AwardDetermined(rank, winners[rank - 1], maxSupply() + 1 - rank, amount);
                return;
            }
        }
        drawCounter = counter;
        emit DrawProgress(counter);
    }

    function claimExecutionReward(address payable recipient) external nonReentrant {
        _validateRecipient(recipient);
        _claimExecutionReward(recipient);
    }
    function _claimExecutionReward(address payable recipient) private {
        if (executionReserve == 0 || msg.sender != executionRecipient) revert InvalidPhase();
        _payExecutionReward(recipient);
    }
    function _payExecutionReward(address payable recipient) private {
        uint256 amount = executionReserve;
        executionReserve = 0;
        _send(recipient, amount);
        emit ExecutionRewardPaid(recipient, amount);
    }
    /// @notice Refund principal is independent of the unused executor budget.
    function recoverExecutionFunding() external onlyOwner nonReentrant {
        if (!refundsAvailable() || executionReserve == 0) revert InvalidPhase();
        uint256 amount = executionReserve;
        executionReserve = 0;
        _send(payable(operator), amount);
        emit ExecutionFundingRecovered(amount);
    }

    /// @notice The current winning NFT holder alone can claim immediately after reveal.
    /// A wallet owning several winning NFTs can claim each award independently.
    function claimPrizeForRank(uint256 rank, address payable recipient) external nonReentrant {
        _claimPrize(rank, recipient);
    }

    function _claimPrize(uint256 rank, address payable recipient) private {
        if (!revealed || rank == 0 || rank > awardCount() || prizeClaimed[rank]) revert InvalidPhase();
        address holder = ownerOf(winningTokenIds[rank]);
        if (msg.sender != holder) revert NotTokenHolder();
        _validateRecipient(recipient);
        uint256 amount = prizeAmountForRank(rank);
        prizeClaimed[rank] = true;
        awardHolder[rank] = holder;
        awardPaidAt[rank] = uint64(block.timestamp);
        prizePaidAmount += amount;
        prizePaid = ++claimedAwardCount == winnerCount();
        if (rank == 1) {
            winningHolder = holder;
            prizePaidAt = uint64(block.timestamp);
            prizeRecipient = recipient;
            emit PrizeDelivered(winningTokenId, holder, recipient, amount);
        }
        _send(recipient, amount);
        emit AwardClaimed(rank, winningTokenIds[rank], holder, recipient, amount);
    }

    function cancelExpiredRound() external nonReentrant {
        if (cancelled || !refundsAvailable()) revert InvalidPhase();
        cancelled = true;
        emit RoundCancelled(roundId);
    }

    /// @notice Unsold expiry or missing entropy at the fixed cutoff refunds the current holder.
    /// Recorded on-time entropy is irrevocable and can never become refundable.
    function refund(uint256 tokenId, address payable recipient) external nonReentrant {
        if (!refundsAvailable()) revert InvalidPhase();
        if (ownerOf(tokenId) != msg.sender) revert NotTokenHolder();
        _validateRecipient(recipient);
        if (!cancelled) {
            cancelled = true;
            emit RoundCancelled(roundId);
        }
        ++refundedCount;
        totalRefunded += mintPrice();
        _burn(tokenId);
        _send(recipient, mintPrice());
        emit Refunded(tokenId, msg.sender, recipient, mintPrice());
    }

    /// @notice Exactly 10% of successful mint receipts, available after reveal. Never refund principal.
    function operatorAllocation() public view returns (uint256) { return soldOut() && !refundsAvailable() ? (totalMintRevenue / BPS_DENOMINATOR) * operatorBps : 0; }
    function operatorWithdrawable() public view returns (uint256) {
        if (!revealed) return 0;
        uint256 remaining = operatorAllocation() - operatorWithdrawn;
        uint256 reserve = protectedBalance();
        return address(this).balance > reserve ? Math.min(remaining, address(this).balance - reserve) : 0;
    }
    function withdrawOperator(address payable recipient, uint256 amount) external onlyOwner nonReentrant { _withdrawOperator(recipient, amount); }
    /// @notice The immutable controller can settle only the ordinary allocation to the fixed operator.
    /// Its batch entry point requires that operator's transaction; no arbitrary recipient or reserve access.
    function withdrawOperatorToOperator() external nonReentrant returns (uint256 amount) {
        if (msg.sender != voting.controller()) revert NotOperator();
        amount = operatorWithdrawable();
        if (amount != 0) _withdrawOperator(payable(operator), amount);
        if (executionRecipient == operator && executionReserve != 0) _payExecutionReward(payable(operator));
    }
    function _withdrawOperator(address payable recipient, uint256 amount) private {
        _validateRecipient(recipient);
        if (amount == 0 || amount > operatorWithdrawable()) revert InsufficientWithdrawableBalance();
        operatorWithdrawn += amount;
        _send(recipient, amount);
        emit OperatorWithdrawn(operator, recipient, amount);
    }

    /// @notice Recover only the separate unused VRF budget after entropy is received or an unsold sale expires.
    function withdrawRandomnessFunding(address payable recipient) external onlyOwner nonReentrant {
        _validateRecipient(recipient);
        if (subscriptionClosed || (!randomnessReceived && !refundsAvailable())) revert InvalidPhase();
        subscriptionClosed = true;
        vrfCoordinator.cancelSubscription(subscriptionId, recipient);
        emit RandomnessFundingWithdrawn(recipient);
    }

    function soldOut() public view returns (bool) { return totalMinted == maxSupply(); }
    function totalSupply() external view returns (uint256) { return totalMinted - refundedCount; }
    function prizeAmount() public view returns (uint256) { return (totalMintRevenue / BPS_DENOMINATOR) * prizeBps; }
    function awardCount() public view returns (uint256) { return winnerCount(); }
    function prizeAmountForRank(uint256 rank) public view returns (uint256) {
        if (rank == 0 || rank > awardCount()) revert InvalidQuantity();
        return (totalMintRevenue / BPS_DENOMINATOR) * (prizeBps / winnerCount());
    }
    function protectedBalance() public view returns (uint256) {
        if (!revealed) return totalMintRevenue - totalRefunded + executionReserve;
        return prizeAmount() - prizePaidAmount + totalAffiliateAccrued - totalAffiliateClaimed + growthReserveBalance() + executionReserve;
    }
    /// @notice Settlement is final when all winning ranks are known and all unclaimed liabilities are funded.
    function readyForNextRound() external view returns (bool) {
        return soldOut() && revealed && address(this).balance >= protectedBalance();
    }
    function refundsAvailable() public view returns (bool) {
        if (randomnessReceived) return false;
        return cancelled || (soldOutAt != 0 ? block.timestamp >= soldOutAt + RANDOMNESS_TIMEOUT : block.timestamp >= mintDeadline());
    }
    function phase() external view returns (Phase) {
        if (prizePaid) return Phase.Complete;
        if (refundsAvailable()) return Phase.Refundable;
        if (!saleActivated()) return Phase.PendingActivation;
        if (!soldOut()) return Phase.Minting;
        if (!randomnessRequested) return Phase.AwaitingRequest;
        if (!randomnessReceived) return Phase.AwaitingRandomness;
        return revealed ? Phase.AwaitingPrize : Phase.AwaitingFinalization;
    }

    /// @notice Permanent ticket numbers are available from mint. A zero result means the draw is pending.
    /// @dev Numbers encode token identity, never its eventual score. Check revealed or use score() for results.
    function combination(uint256 tokenId) public view returns (uint256[4] memory numbers, uint256 code, uint256 result) {
        _requireOwned(tokenId);
        (numbers, code) = renderer.encodeCombination(tokenId - 1, permanentCombinationKey());
        if (revealed) result = renderer.rankToken(tokenId, maxSupply(), _winningIds(), winnerCount());
    }

    /// @notice Fixed public presentation key, available before minting. It provides uniqueness, not randomness.
    function combinationKey() public view returns (bytes32) {
        return permanentCombinationKey();
    }

    /// @notice Recover an existing ticket's identity from its four permanent numbers, even before the draw.
    function tokenIdForCombination(uint256[4] calldata numbers) public view returns (uint256 tokenId) {
        tokenId = renderer.tokenIdForCombination(numbers, permanentCombinationKey(), maxSupply());
        _requireOwned(tokenId);
    }

    /// @notice Draw-dependent score. Pending and nonexistent tokens never masquerade as a settled zero score.
    function score(uint256 tokenId) public view returns (uint256) {
        _requireOwned(tokenId);
        if (!revealed) revert RevealNotAvailable();
        return renderer.rankToken(tokenId, maxSupply(), _winningIds(), winnerCount());
    }

    /// @notice Decode permanent ticket identity, then compute its VRF-derived score after finalization.
    function scoreCombination(uint256[4] calldata numbers) external view returns (uint256) {
        if (!revealed) revert RevealNotAvailable();
        return score(tokenIdForCombination(numbers));
    }

    /// @notice Immutable metadata: outcomes and phase are deliberately read through the contract, not tokenURI.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        (uint256[4] memory numbers, uint256 code) = renderer.encodeCombination(tokenId - 1, permanentCombinationKey());
        return renderer.tokenURI(ManekinekoRendererV11.Appearance(seasonId, seasonName, name(), collectionColor(), textColor()), tokenId, numbers, code);
    }

    function collectionColor() public view returns (string memory) { return string(abi.encodePacked(backgroundHex)); }
    function textColor() public view returns (string memory) { return whiteText ? "#FFFFFF" : "#000000"; }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }
    function _validateRecipient(address recipient) private view {
        if (recipient == address(0) || recipient == address(this) || recipient == address(vrfCoordinator)) revert InvalidRecipient();
    }
    function _winningIds() private view returns (uint256[10] memory winners) {
        for (uint256 rank = 1; rank <= winnerCount(); ++rank) winners[rank - 1] = winningTokenIds[rank];
    }
    function _awardRank(uint256 tokenId) private view returns (uint256) {
        for (uint256 rank = 1; rank <= winnerCount(); ++rank) if (tokenId == winningTokenIds[rank]) return rank;
        return 0;
    }
    function _send(address payable recipient, uint256 amount) private {
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();
    }
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (to == address(this) || to == address(vrfCoordinator)) revert InvalidRecipient();
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && soldOut() && !refundsAvailable() && (!revealed || (_awardRank(tokenId) != 0 && !prizeClaimed[_awardRank(tokenId)]))) revert TransfersLocked();
        address previous = super._update(to, tokenId, auth);
        voting.recordTransfer(previous, to);
        return previous;
    }
}
