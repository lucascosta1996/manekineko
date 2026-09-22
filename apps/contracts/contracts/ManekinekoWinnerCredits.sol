// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {MerkleProof} from "@openzeppelin/contracts/utils/cryptography/MerkleProof.sol";

interface IWinnerCreditFactory {
    function rounds(uint256 id) external view returns (address);
}

interface IWinnerCreditRound {
    function CONTRACT_VERSION() external view returns (string memory);
    function ALGORITHM_VERSION() external view returns (string memory);
    function roundId() external view returns (uint256);
    function owner() external view returns (address);
    function maxSupply() external view returns (uint256);
    function mintPrice() external view returns (uint256);
    function mintDeadline() external view returns (uint256);
    function totalMinted() external view returns (uint256);
    function saleActivated() external view returns (bool);
    function cancelled() external view returns (bool);
    function prizePaid() external view returns (bool);
    function winningHolder() external view returns (address);
    function finalizedAt() external view returns (uint256);
    function prizePaidAt() external view returns (uint64);
    function mint(address to, uint256 quantity) external payable;
}

/// @notice One nontransferable sponsored mint per winning wallet for this registry's lifetime.
/// @dev Factory approval is an explicit governance trust boundary: approve only reviewed, immutable V6 factories.
/// Historical winners without winningHolder() require an immutable, independently reviewed canonical-event Merkle root.
/// Sponsorship pays the ordinary mint price; it does not dilute prize, affiliate or refund accounting in the round.
contract ManekinekoWinnerCredits is Ownable2Step, ReentrancyGuard {
    string public constant WINNER_CREDITS_VERSION = "winner-credits-v2";
    bytes32 public constant LEGACY_DOMAIN = keccak256("MANEKINEKO_WINNER_CREDIT_LEGACY_V1");
    bytes32 private constant CONTRACT_VERSION_HASH = keccak256("affiliate-v6");
    bytes32 private constant ALGORITHM_VERSION_HASH = keccak256("unique-rank-v3");
    bytes32 public immutable legacyMerkleRoot;

    struct Collection {
        address factory;
        uint256 roundId;
        uint256 sequence;
        uint256 registeredAt;
        bytes32 codeHash;
        bool rewardsOnly;
    }

    struct Credit {
        address beneficiary;
        uint256 sourceSequence;
        uint256 earnedAt;
        address redeemedIn;
        uint256 redeemedTokenId;
    }

    struct LegacyWin {
        address sourceRound;
        address holder;
        uint256 tokenId;
        uint256 paidAt;
        bytes32 transactionHash;
    }

    mapping(address => bytes32) public approvedFactoryCodeHash;
    mapping(address => Collection) public collections;
    mapping(address => Credit) public credits;
    /// @notice The qualifying source used for this wallet's sole sponsored mint; never cleared, including after refunds.
    mapping(address => address) public redeemedSource;
    mapping(address => uint256) public sponsorBalance;
    /// @notice Cumulative receipts for idempotent funding automation; spending and withdrawals do not reset it.
    mapping(address => uint256) public totalFunded;
    uint256 public collectionCount;
    uint256 public totalSponsorBalance;

    error InvalidFactory();
    error FactoryAlreadyApproved();
    error InvalidCollection();
    error CollectionAlreadyRegistered();
    error CollectionNotRegistered();
    error CreditUnavailable();
    error CreditAlreadyIssued();
    error InvalidLegacyProof();
    error NotBeneficiary();
    error CreditAlreadyRedeemed();
    error LifetimeRewardAlreadyUsed();
    error NotFutureCollection();
    error MintUnavailable();
    error InsufficientSponsorship();
    error InvalidAmount();
    error InvalidRecipient();
    error TransferFailed();
    error OwnershipRenunciationDisabled();

    event FactoryApproved(address indexed factory, bytes32 codeHash);
    event CollectionRegistered(address indexed round, address indexed factory, uint256 roundId, uint256 sequence, uint256 registeredAt, bool rewardsOnly);
    event CreditIssued(address indexed sourceRound, address indexed beneficiary, uint256 sourceSequence, uint256 earnedAt);
    event CreditRedeemed(address indexed sourceRound, address indexed targetRound, address indexed beneficiary, uint256 tokenId, uint256 mintPrice);
    event CollectionFunded(address indexed targetRound, address indexed funder, uint256 amount);
    event SponsorshipWithdrawn(address indexed targetRound, address indexed recipient, uint256 amount);

    constructor(address initialOwner, bytes32 historicalWinnerRoot) Ownable(initialOwner) {
        legacyMerkleRoot = historicalWinnerRoot;
    }

    /// @notice Append-only approval; callers must supply the independently reviewed deployed runtime hash.
    function approveFactory(address factory, bytes32 expectedCodeHash) external onlyOwner {
        if (approvedFactoryCodeHash[factory] != bytes32(0)) revert FactoryAlreadyApproved();
        if (factory.code.length == 0 || expectedCodeHash == bytes32(0) || factory.codehash != expectedCodeHash) revert InvalidFactory();
        approvedFactoryCodeHash[factory] = expectedCodeHash;
        emit FactoryApproved(factory, expectedCodeHash);
    }

    /// @notice Register a trusted round. Late registration recovers winner eligibility, but never opens a late mint target.
    function registerCollection(address factory, uint256 id) external nonReentrant returns (address round) {
        _checkFactory(factory);
        round = IWinnerCreditFactory(factory).rounds(id);
        if (collections[round].sequence != 0) revert CollectionAlreadyRegistered();
        if (round.code.length == 0 || id == 0 || credits[round].beneficiary != address(0)) revert InvalidCollection();
        IWinnerCreditRound candidate = IWinnerCreditRound(round);
        if (keccak256(bytes(candidate.CONTRACT_VERSION())) != CONTRACT_VERSION_HASH ||
            keccak256(bytes(candidate.ALGORITHM_VERSION())) != ALGORITHM_VERSION_HASH ||
            candidate.roundId() != id || candidate.owner() == address(0) || candidate.maxSupply() == 0 ||
            candidate.mintPrice() == 0) revert InvalidCollection();
        bool rewardsOnly = candidate.saleActivated() || candidate.cancelled() || candidate.totalMinted() != 0 ||
            candidate.mintDeadline() <= block.timestamp || candidate.prizePaid();
        // Verify both immutable settlement getters exist even for a pre-settlement registration.
        address holder = candidate.winningHolder();
        uint64 paidAt = candidate.prizePaidAt();
        if (candidate.prizePaid() != (holder != address(0) && paidAt != 0) || paidAt > block.timestamp) revert InvalidCollection();
        uint256 sequence = ++collectionCount;
        collections[round] = Collection(factory, id, sequence, block.timestamp, round.codehash, rewardsOnly);
        emit CollectionRegistered(round, factory, id, sequence, block.timestamp, rewardsOnly);
    }

    /// @notice Anyone may record the reward, but only the settled winning holder receives or spends it.
    function claimCredit(address sourceRound) external nonReentrant {
        _claimCredit(sourceRound);
    }

    function claimLegacyCredit(LegacyWin calldata win, bytes32[] calldata proof) external nonReentrant {
        _claimLegacyCredit(win, proof);
    }

    function redeem(address sourceRound, address targetRound) external nonReentrant returns (uint256 tokenId) {
        return _redeem(sourceRound, targetRound);
    }

    /// @notice The beneficiary may issue their earned credit and spend it in one transaction.
    function claimAndRedeem(address sourceRound, address targetRound) external nonReentrant returns (uint256 tokenId) {
        if (credits[sourceRound].beneficiary == address(0)) _claimCredit(sourceRound);
        return _redeem(sourceRound, targetRound);
    }

    function redeemLegacy(LegacyWin calldata win, bytes32[] calldata proof, address targetRound) external nonReentrant returns (uint256 tokenId) {
        if (credits[win.sourceRound].beneficiary == address(0)) _claimLegacyCredit(win, proof);
        return _redeem(win.sourceRound, targetRound);
    }

    /// @notice Anyone can sponsor a registered collection. Only the owner manages unspent sponsorship.
    function fundCollection(address targetRound) external payable nonReentrant {
        if (_checkedCollection(targetRound).rewardsOnly) revert MintUnavailable();
        if (msg.value == 0) revert InvalidAmount();
        sponsorBalance[targetRound] += msg.value;
        totalFunded[targetRound] += msg.value;
        totalSponsorBalance += msg.value;
        emit CollectionFunded(targetRound, msg.sender, msg.value);
    }

    function withdrawSponsorship(address targetRound, address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        if (amount == 0 || amount > sponsorBalance[targetRound]) revert InvalidAmount();
        sponsorBalance[targetRound] -= amount;
        totalSponsorBalance -= amount;
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();
        emit SponsorshipWithdrawn(targetRound, recipient, amount);
    }

    /// @notice OpenZeppelin StandardMerkleTree-compatible double-hashed leaf, bound to this chain and settlement event.
    function legacyLeaf(LegacyWin calldata win) public view returns (bytes32) {
        return keccak256(bytes.concat(keccak256(abi.encode(
            LEGACY_DOMAIN, block.chainid, win.sourceRound, win.holder, win.tokenId, win.paidAt, win.transactionHash
        ))));
    }

    function renounceOwnership() public view override onlyOwner { revert OwnershipRenunciationDisabled(); }

    function _checkFactory(address factory) private view {
        bytes32 expected = approvedFactoryCodeHash[factory];
        if (expected == bytes32(0) || factory.codehash != expected) revert InvalidFactory();
    }

    function _checkedCollection(address round) private view returns (Collection storage info) {
        info = collections[round];
        if (info.sequence == 0) revert CollectionNotRegistered();
        _checkFactory(info.factory);
        if (round.codehash != info.codeHash || IWinnerCreditFactory(info.factory).rounds(info.roundId) != round) revert InvalidCollection();
    }

    function _claimCredit(address sourceRound) private {
        if (credits[sourceRound].beneficiary != address(0)) revert CreditAlreadyIssued();
        Collection storage info = _checkedCollection(sourceRound);
        IWinnerCreditRound source = IWinnerCreditRound(sourceRound);
        address beneficiary = source.winningHolder();
        uint256 earnedAt = source.prizePaidAt();
        if (!source.prizePaid() || beneficiary == address(0) || earnedAt == 0 || earnedAt > block.timestamp) revert CreditUnavailable();
        // A source registered after settlement must not lose a reward solely because its registry sequence is later.
        _issue(sourceRound, beneficiary, info.rewardsOnly ? 0 : info.sequence, earnedAt);
    }

    function _claimLegacyCredit(LegacyWin calldata win, bytes32[] calldata proof) private {
        if (credits[win.sourceRound].beneficiary != address(0)) revert CreditAlreadyIssued();
        if (legacyMerkleRoot == bytes32(0) || win.sourceRound == address(0) || win.holder == address(0) ||
            win.tokenId == 0 || win.paidAt == 0 || win.paidAt > block.timestamp || win.transactionHash == bytes32(0) ||
            collections[win.sourceRound].sequence != 0 || !MerkleProof.verifyCalldata(proof, legacyMerkleRoot, legacyLeaf(win))) revert InvalidLegacyProof();
        _issue(win.sourceRound, win.holder, 0, win.paidAt);
    }

    function _issue(address sourceRound, address beneficiary, uint256 sourceSequence, uint256 earnedAt) private {
        if (redeemedSource[beneficiary] != address(0)) revert LifetimeRewardAlreadyUsed();
        credits[sourceRound] = Credit(beneficiary, sourceSequence, earnedAt, address(0), 0);
        emit CreditIssued(sourceRound, beneficiary, sourceSequence, earnedAt);
    }

    function _redeem(address sourceRound, address targetRound) private returns (uint256 tokenId) {
        Credit storage credit = credits[sourceRound];
        if (credit.beneficiary != msg.sender) revert NotBeneficiary();
        if (credit.redeemedIn != address(0)) revert CreditAlreadyRedeemed();
        if (redeemedSource[msg.sender] != address(0)) revert LifetimeRewardAlreadyUsed();
        Collection storage targetInfo = _checkedCollection(targetRound);
        if (sourceRound == targetRound || targetInfo.sequence <= credit.sourceSequence || targetInfo.registeredAt <= credit.earnedAt) revert NotFutureCollection();
        if (targetInfo.rewardsOnly) revert MintUnavailable();
        IWinnerCreditRound target = IWinnerCreditRound(targetRound);
        if (!target.saleActivated() || target.cancelled() || block.timestamp >= target.mintDeadline()) revert MintUnavailable();
        tokenId = target.totalMinted() + 1;
        if (tokenId > target.maxSupply()) revert MintUnavailable();
        uint256 price = target.mintPrice();
        if (sponsorBalance[targetRound] < price) revert InsufficientSponsorship();
        credit.redeemedIn = targetRound;
        credit.redeemedTokenId = tokenId;
        redeemedSource[msg.sender] = sourceRound;
        sponsorBalance[targetRound] -= price;
        totalSponsorBalance -= price;
        // Ordinary paid, unattributed mint: one unit of finite supply with the same prize/pool/refund rights.
        // On failure all effects revert. If the eventual round refunds, the holder receives ETH; this credit stays spent.
        target.mint{value: price}(msg.sender, 1);
        emit CreditRedeemed(sourceRound, targetRound, msg.sender, tokenId, price);
    }
}
