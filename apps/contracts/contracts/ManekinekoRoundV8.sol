// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {ManekinekoAffiliateEligibilityV3} from "./ManekinekoAffiliateEligibilityV3.sol";
import {ManekinekoRendererV8} from "./ManekinekoRendererV8.sol";
import {IVRFCoordinatorV2Plus} from "./vendor/chainlink-vrf-v2.5/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import {VRFV2PlusClient} from "./vendor/chainlink-vrf-v2.5/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

/// @title A finite Ethereum NFT competition with one immutable VRF request and a configurable number of equally rewarded winning NFTs.
/// @notice Artwork and scoring are on-chain; Chainlink generates randomness and verifies its proof on-chain.
/// @dev Coordinator authentication is implemented here rather than inheriting the upstream consumer's
///      mutable coordinator/ownership API. Neither owner nor coordinator can replace this round's verifier.
contract ManekinekoRoundV8 is ERC721, Ownable2Step, ReentrancyGuard {

    struct Config {
        string name;
        string symbol;
        bytes32 seasonId;
        string seasonName;
        string collectionColor;
        string textColor;
        uint256 roundId;
        uint256 maxSupply;
        uint256 mintPrice;
        uint256 mintDeadline;
        address initialOwner;
        address vrfCoordinator;
        bytes32 keyHash;
        uint16 requestConfirmations;
        uint32 callbackGasLimit;
        uint256 maxAffiliateSlots;
        address enrollmentSigner;
        uint256 prizeBps;
        uint256 affiliatePoolBps;
        address affiliateEligibility;
        uint256 winnerCount;
        uint256 minAffiliateReferrals;
        uint256 affiliatePayoutCapBps;
        uint256 saleStartAt;
    }

    enum Phase { PendingActivation, Minting, AwaitingRequest, AwaitingRandomness, AwaitingFinalization, AwaitingPrize, Complete, Refundable }

    uint256 public constant MAX_SUPPLY = 65_536;
    uint256 public constant MAX_MINT_BATCH = 20;
    uint256 public constant MAX_DRAW_ATTEMPTS = 8;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant MAX_AFFILIATE_SLOTS = 100;
    string public constant CONTRACT_VERSION = "affiliate-v8";
    bytes32 public constant ENROLLMENT_TYPEHASH = keccak256("Enrollment(address applicant,uint256 affiliateId,uint256 poolBps,address sourceCollection,uint256 sourceTokenId,bytes32 nonce,uint256 deadline)");
    uint256 public constant PRIZE_CLAIM_DELAY = 0;
    string public constant ALGORITHM_VERSION = "unique-rank-v5";
    // Provider and score descriptions live in the shared on-chain renderer metadata.
    bytes32 public constant DRAW_DOMAIN = keccak256("MANEKINEKO_MULTI_AWARD_RANK_V5");
    bytes32 private constant COMBINATION_DOMAIN = keccak256("MANEKINEKO_COMBINATION_V5");

    uint256 public immutable roundId;
    bytes32 public immutable seasonId;
    string public seasonName;
    bytes7 private immutable backgroundHex;
    bool private immutable whiteText;
    uint256 public immutable maxSupply;
    uint256 public immutable mintPrice;
    uint256 public immutable mintDeadline;
    IVRFCoordinatorV2Plus public immutable vrfCoordinator;
    bytes32 public immutable keyHash;
    uint256 public immutable subscriptionId;
    uint16 public immutable requestConfirmations;
    uint32 public immutable callbackGasLimit;

    uint256 public immutable winnerCount;
    uint256 public claimedAwardCount;
    uint256 public immutable minAffiliateReferrals;
    uint256 public immutable affiliatePayoutCapBps;
    uint256 public immutable saleStartAt;
    uint256 public soldOutAt;
    uint256 public affiliateQualifiedCount;
    uint256 public affiliateEqualShare;
    uint256 public growthReserveWithdrawn;
    mapping(uint256 => uint256) public winningTokenIds;
    mapping(uint256 => bool) public prizeClaimed;
    mapping(uint256 => address) public awardHolder;
    mapping(uint256 => uint64) public awardPaidAt;
    uint256 public immutable prizeBps;
    uint256 public immutable affiliatePoolBps;
    uint256 public totalReferredMints;
    uint256 public immutable maxAffiliateSlots;
    address public immutable enrollmentSigner;
    ManekinekoAffiliateEligibilityV3 public immutable affiliateEligibility;
    ManekinekoRendererV8 public immutable renderer;
    uint256 public affiliateCount;
    mapping(uint256 => address) public affiliateWallet;
    mapping(address => uint256) public affiliateIdOf;
    mapping(uint256 => uint256) public affiliateReferredMints;
    mapping(uint256 => uint256) public affiliateAccrued;
    mapping(uint256 => uint256) public affiliateClaimed;
    uint256 public totalAffiliateAccrued;
    uint256 public totalAffiliateClaimed;

    bool public saleActivated;
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
    error AffiliatePoolMismatch();
    error EnrollmentNonceUsed();
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
    error OwnershipRenunciationDisabled();

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
    event SaleActivated(uint256 indexed roundId);
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
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    constructor(Config memory config, address onchainRenderer)
        ERC721(config.name, config.symbol) Ownable(config.initialOwner)
    {
        if (bytes(config.symbol).length == 0 || bytes(config.symbol).length > 16 ||
            config.roundId == 0 || config.seasonId == bytes32(0) || onchainRenderer.code.length == 0) revert InvalidConfig();
        ManekinekoRendererV8(onchainRenderer).validateAppearance(config.seasonName, config.name, config.collectionColor, config.textColor);
        ManekinekoRendererV8(onchainRenderer).validateTerms(
            [config.maxSupply, config.mintPrice, config.prizeBps, config.affiliatePoolBps, config.maxAffiliateSlots,
             config.mintDeadline, uint256(config.requestConfirmations), uint256(config.callbackGasLimit)],
            [config.initialOwner, config.enrollmentSigner, config.affiliateEligibility, config.vrfCoordinator], config.keyHash
        );
        if (config.prizeBps == 0 || config.winnerCount == 0 || config.winnerCount > 10 ||
            config.maxSupply < config.winnerCount || config.prizeBps % config.winnerCount != 0 ||
            config.minAffiliateReferrals == 0 || config.minAffiliateReferrals > config.maxSupply ||
            config.affiliatePayoutCapBps == 0 || config.affiliatePayoutCapBps > BPS_DENOMINATOR ||
            config.saleStartAt < block.timestamp || config.saleStartAt >= config.mintDeadline) revert InvalidConfig();
        winnerCount = config.winnerCount;
        minAffiliateReferrals = config.minAffiliateReferrals;
        affiliatePayoutCapBps = config.affiliatePayoutCapBps;
        saleStartAt = config.saleStartAt;
        prizeBps = config.prizeBps;
        affiliatePoolBps = config.affiliatePoolBps;
        maxAffiliateSlots = config.maxAffiliateSlots;
        enrollmentSigner = config.enrollmentSigner;
        affiliateEligibility = ManekinekoAffiliateEligibilityV3(config.affiliateEligibility);
        renderer = ManekinekoRendererV8(onchainRenderer);
        roundId = config.roundId;
        seasonId = config.seasonId;
        seasonName = config.seasonName;
        backgroundHex = bytes7(bytes(config.collectionColor));
        whiteText = keccak256(bytes(config.textColor)) == keccak256("#FFFFFF");
        maxSupply = config.maxSupply;
        mintPrice = config.mintPrice;
        mintDeadline = config.mintDeadline;
        vrfCoordinator = IVRFCoordinatorV2Plus(config.vrfCoordinator);
        keyHash = config.keyHash;
        requestConfirmations = config.requestConfirmations;
        callbackGasLimit = config.callbackGasLimit;
        // The round owns its subscription; no external subscription owner can remove this consumer.
        uint256 id = vrfCoordinator.createSubscription();
        subscriptionId = id;
        vrfCoordinator.addConsumer(id, address(this));
        emit SubscriptionPrepared(id, config.vrfCoordinator);
    }

    /// @notice Anyone can fund the VRF subscription separately from ticket/prize funds.
    function fundRandomness() external payable nonReentrant {
        if (msg.value == 0 || subscriptionClosed || randomnessReceived || refundsAvailable()) revert InvalidFunding();
        vrfCoordinator.fundSubscriptionWithNative{value: msg.value}(subscriptionId);
        emit RandomnessFunded(msg.sender, msg.value);
    }

    /// @notice One-way activation after initial VRF funding. Funding still needs monitoring as fees vary.
    function activateSale() external onlyOwner nonReentrant {
        if (saleActivated || block.timestamp < saleStartAt || refundsAvailable()) revert InvalidPhase();
        affiliateEligibility.requireRegistered(address(this));
        (, uint96 nativeBalance, , address subscriptionOwner, address[] memory consumers) = vrfCoordinator.getSubscription(subscriptionId);
        if (nativeBalance == 0 || subscriptionOwner != address(this) || consumers.length != 1 || consumers[0] != address(this)) revert SubscriptionNotReady();
        saleActivated = true;
        emit SaleActivated(roundId);
    }

    /// @notice Automated abuse checks authorize enrollment; only the bound wallet can consume a permit.
    /// @dev The backend signer is an admission trust boundary, never a custodian of mint receipts.
    function enrollAffiliate(address applicant, uint256 affiliateId, uint256 poolBps, address sourceCollection, uint256 sourceTokenId, bytes32 nonce, uint256 deadline, bytes calldata signature) external nonReentrant {
        if (block.timestamp >= saleStartAt || block.timestamp >= mintDeadline) revert EnrollmentClosed();
        if (applicant != msg.sender || deadline < block.timestamp || deadline > mintDeadline) revert InvalidEnrollment();
        if (affiliateIdOf[applicant] != 0) revert AffiliateAlreadyEnrolled();
        if (affiliateCount == maxAffiliateSlots) revert AffiliateCapacityReached();
        if (affiliateId == 0 || affiliateId > maxAffiliateSlots || affiliateWallet[affiliateId] != address(0)) revert AffiliatePositionUnavailable();
        if (poolBps != affiliatePoolBps) revert AffiliatePoolMismatch();
        affiliateEligibility.consumeEnrollment(applicant, affiliateId, poolBps, sourceCollection, sourceTokenId, nonce, deadline, signature);
        ++affiliateCount;
        affiliateWallet[affiliateId] = applicant;
        affiliateIdOf[applicant] = affiliateId;
        emit AffiliateEnrolled(affiliateId, applicant, poolBps, nonce);
    }

    /// @notice Backward-compatible nonce view; the immutable eligibility gate owns the shared permit verification code.
    function enrollmentNonceUsed(bytes32 nonce) external view returns (bool) {
        return affiliateEligibility.enrollmentNonceUsed(address(this), nonce);
    }

    /// @notice Offers identify an exact slot. A competing enrollment never silently changes its rate.
    function nextAvailableAffiliateId() external view returns (uint256) {
        for (uint256 id = 1; id <= maxAffiliateSlots; ++id) {
            if (affiliateWallet[id] == address(0)) return id;
        }
        return 0;
    }

    function mint(address to, uint256 quantity) external payable nonReentrant {
        _mintTickets(to, quantity, 0);
    }

    /// @notice A paid referral contributes to this affiliate’s share of the collection-wide pool at sellout.
    function mintWithAffiliate(address to, uint256 quantity, uint256 affiliateId) external payable nonReentrant {
        address affiliate = affiliateWallet[affiliateId];
        if (affiliate == address(0)) revert InvalidAffiliate();
        if (msg.sender == affiliate || to == affiliate) revert SelfReferral();
        _mintTickets(to, quantity, affiliateId);
    }

    function _mintTickets(address to, uint256 quantity, uint256 affiliateId) private {
        if (!saleActivated || block.timestamp < saleStartAt || cancelled || soldOut() || block.timestamp >= mintDeadline) revert MintClosed();
        _validateRecipient(to);
        if (quantity == 0 || quantity > MAX_MINT_BATCH || quantity > maxSupply - totalMinted) revert InvalidQuantity();
        uint256 cost = mintPrice * quantity;
        if (msg.value != cost) revert InvalidPayment(cost, msg.value);
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
        }
        emit Minted(msg.sender, to, firstId, quantity);
    }

    /// @notice Includes direct primary mints; excludes VRF funding and unsolicited ETH.
    function affiliatePoolAmount() public view returns (uint256) {
        return (totalMintRevenue / BPS_DENOMINATOR) * affiliatePoolBps;
    }

    /// @notice Provisional equal share; a new qualifier or a different minimum referral count changes the estimate.
    function affiliateEstimatedShare(uint256 id) external view returns (uint256) {
        if (refundsAvailable() || affiliateReferredMints[id] < minAffiliateReferrals) return 0;
        if (soldOut()) return affiliateAccrued[id];
        (, uint256 equalShare) = _qualifiedShare();
        return equalShare;
    }

    function affiliateMinimumReferrals() external view returns (uint256) { return minAffiliateReferrals; }

    function _qualifiedShare() private view returns (uint256 count, uint256 equalShare) {
        uint256 lowest = type(uint256).max;
        for (uint256 id = 1; id <= maxAffiliateSlots; ++id) {
            uint256 referred = affiliateReferredMints[id];
            if (affiliateWallet[id] != address(0) && referred >= minAffiliateReferrals) {
                ++count;
                if (referred < lowest) lowest = referred;
            }
        }
        if (count != 0) equalShare = Math.min(affiliatePoolAmount() / count,
            Math.mulDiv(lowest * mintPrice, affiliatePayoutCapBps, BPS_DENOMINATOR));
    }

    /// @dev Up to 100 slots; common cap retains exact equal payouts. Unallocated pool and rounding stay in growth reserve.
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

    /// @notice Pool shares vest only at irrevocable sellout; unsold expiry creates no affiliate entitlement.
    function affiliateClaimable(uint256 affiliateId) public view returns (uint256) {
        if (!soldOut()) return 0;
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
    function requestRandomness() external nonReentrant returns (uint256 id) {
        if (!soldOut() || cancelled || randomnessRequested) revert InvalidPhase();
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
        randomWord = words[0];
        randomnessReceived = true;
        emit RandomnessReceived(id, words[0]);
    }

    /// @notice Finish the unique ranking with bounded deterministic work; every caller follows the same stream.
    /// @dev Keccak expansion uses a cryptographic assumption, not new independent information-theoretic entropy.
    function finalizeDraw(uint256 attempts) external nonReentrant {
        if (!randomnessReceived || revealed) revert InvalidPhase();
        if (attempts == 0 || attempts > MAX_DRAW_ATTEMPTS) revert InvalidQuantity();
        uint256 counter = drawCounter;
        for (uint256 i; i < attempts; ++i) {
            bytes32 candidate = keccak256(abi.encode(DRAW_DOMAIN, randomWord, block.chainid, address(this), roundId, maxSupply, counter));
            (bool accepted, uint256[10] memory winners) = renderer.drawWinners(candidate, maxSupply, winnerCount);
            ++counter;
            if (accepted) {
                drawCounter = counter;
                winningTokenId = winners[0];
                for (uint256 rank = 1; rank <= winnerCount; ++rank) winningTokenIds[rank] = winners[rank - 1];
                highestScore = maxSupply;
                finalizedAt = block.timestamp;
                revealed = true;
                emit WinnerDetermined(winningTokenId, highestScore, prizeAmountForRank(1));
                uint256 amount = prizeAmountForRank(1);
                for (uint256 rank = 1; rank <= winnerCount; ++rank)
                    emit AwardDetermined(rank, winners[rank - 1], maxSupply + 1 - rank, amount);
                emit BatchMetadataUpdate(1, totalMinted);
                return;
            }
        }
        drawCounter = counter;
        emit DrawProgress(counter);
    }

    /// @notice The current winning NFT holder alone can claim immediately after reveal.
    /// A wallet owning several winning NFTs can claim each award independently.
    function claimPrizeForRank(uint256 rank, address payable recipient) external nonReentrant {
        _claimPrize(rank, recipient);
    }

    /// @notice Primary award convenience alias; there is no owner-triggered prize delivery path.
    function claimPrize(address payable recipient) external nonReentrant { _claimPrize(1, recipient); }

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
        prizePaid = ++claimedAwardCount == winnerCount;
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
        if (totalMinted != 0) emit BatchMetadataUpdate(1, totalMinted);
    }

    /// @notice Unsold rounds refund the current token holder. Sold-out rounds cannot discard a draw.
    function refund(uint256 tokenId, address payable recipient) external nonReentrant {
        if (!refundsAvailable()) revert InvalidPhase();
        if (ownerOf(tokenId) != msg.sender) revert NotTokenHolder();
        _validateRecipient(recipient);
        if (!cancelled) {
            cancelled = true;
            emit RoundCancelled(roundId);
            emit BatchMetadataUpdate(1, totalMinted);
        }
        ++refundedCount;
        totalRefunded += mintPrice;
        _burn(tokenId);
        _send(recipient, mintPrice);
        emit Refunded(tokenId, msg.sender, recipient, mintPrice);
    }

    function withdraw(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        _validateRecipient(recipient);
        if (amount == 0 || amount > withdrawableBalance()) revert InsufficientWithdrawableBalance();
        _send(recipient, amount);
        emit Withdrawn(recipient, amount);
    }

    /// @notice Recover only the separate unused VRF budget after entropy is received or an unsold sale expires.
    function withdrawRandomnessFunding(address payable recipient) external onlyOwner nonReentrant {
        _validateRecipient(recipient);
        if (subscriptionClosed || (!randomnessReceived && !refundsAvailable())) revert InvalidPhase();
        subscriptionClosed = true;
        vrfCoordinator.cancelSubscription(subscriptionId, recipient);
        emit RandomnessFundingWithdrawn(recipient);
    }

    function soldOut() public view returns (bool) { return totalMinted == maxSupply; }
    function totalSupply() external view returns (uint256) { return totalMinted - refundedCount; }
    function prizeAmount() public view returns (uint256) { return (totalMintRevenue / BPS_DENOMINATOR) * prizeBps; }
    function awardCount() public view returns (uint256) { return winnerCount; }
    function prizeAmountForRank(uint256 rank) public view returns (uint256) {
        if (rank == 0 || rank > awardCount()) revert InvalidQuantity();
        return (totalMintRevenue / BPS_DENOMINATOR) * (prizeBps / winnerCount);
    }
    function protectedBalance() public view returns (uint256) {
        return prizeAmount() - prizePaidAmount + totalAffiliateAccrued - totalAffiliateClaimed + growthReserveBalance();
    }
    /// @notice Settlement is final when all winning ranks are known and all unclaimed liabilities are funded.
    function readyForNextRound() external view returns (bool) {
        return soldOut() && revealed && address(this).balance >= protectedBalance();
    }
    function refundsAvailable() public view returns (bool) {
        return cancelled || (!soldOut() && block.timestamp >= mintDeadline);
    }
    function withdrawableBalance() public view returns (uint256) {
        if (revealed) {
            uint256 reserved = protectedBalance();
            return address(this).balance > reserved ? address(this).balance - reserved : 0;
        }
        if (!refundsAvailable()) return 0;
        uint256 liability = totalMintRevenue - totalRefunded;
        return address(this).balance > liability ? address(this).balance - liability : 0;
    }
    function phase() external view returns (Phase) {
        if (prizePaid) return Phase.Complete;
        if (refundsAvailable()) return Phase.Refundable;
        if (!saleActivated) return Phase.PendingActivation;
        if (!soldOut()) return Phase.Minting;
        if (!randomnessRequested) return Phase.AwaitingRequest;
        if (!randomnessReceived) return Phase.AwaitingRandomness;
        return revealed ? Phase.AwaitingPrize : Phase.AwaitingFinalization;
    }

    function combination(uint256 tokenId) public view returns (uint256[4] memory numbers, uint256 code, uint256 result) {
        _requireOwned(tokenId);
        if (!revealed) revert RevealNotAvailable();
        result = renderer.rankToken(tokenId, maxSupply, _winningIds(), winnerCount);
        (numbers, code) = renderer.encodeCombination(result - 1, combinationKey());
    }

    /// @notice Public, immutable-after-reveal key for the reversible number display.
    /// @dev Domain separation prevents reusing the draw's candidate stream as a display key.
    function combinationKey() public view returns (bytes32) {
        if (!revealed) revert RevealNotAvailable();
        return keccak256(abi.encode(COMBINATION_DOMAIN, randomWord, block.chainid, address(this), roundId, maxSupply));
    }

    /// @notice Reconstructs a valid collection rank from its four displayed numbers on-chain.
    function scoreCombination(uint256[4] calldata numbers) external view returns (uint256) {
        return renderer.scoreCombination(numbers, combinationKey(), maxSupply);
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        uint256[4] memory numbers;
        uint256 result;
        if (revealed) (numbers, , result) = combination(tokenId);
        return renderer.tokenURI(ManekinekoRendererV8.Appearance(seasonId, seasonName, name(), collectionColor(), textColor()), tokenId, refundsAvailable(), revealed, numbers, result, _awardRank(tokenId), _awardRank(tokenId) == 0 ? 0 : prizeAmountForRank(_awardRank(tokenId)));
    }

    function collectionColor() public view returns (string memory) { return string(abi.encodePacked(backgroundHex)); }
    function textColor() public view returns (string memory) { return whiteText ? "#FFFFFF" : "#000000"; }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }
    function renounceOwnership() public view override onlyOwner { revert OwnershipRenunciationDisabled(); }
    function _validateRecipient(address recipient) private view {
        if (recipient == address(0) || recipient == address(this) || recipient == address(vrfCoordinator)) revert InvalidRecipient();
    }
    function _winningIds() private view returns (uint256[10] memory winners) {
        for (uint256 rank = 1; rank <= winnerCount; ++rank) winners[rank - 1] = winningTokenIds[rank];
    }
    function _awardRank(uint256 tokenId) private view returns (uint256) {
        for (uint256 rank = 1; rank <= winnerCount; ++rank) if (tokenId == winningTokenIds[rank]) return rank;
        return 0;
    }
    function _send(address payable recipient, uint256 amount) private {
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();
    }
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (to == address(this) || to == address(vrfCoordinator)) revert InvalidRecipient();
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && soldOut() && (!revealed || (_awardRank(tokenId) != 0 && !prizeClaimed[_awardRank(tokenId)]))) revert TransfersLocked();
        return super._update(to, tokenId, auth);
    }
}
