// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IAffiliateEligibilityFactory {
    function rounds(uint256 id) external view returns (address);
}

interface IAffiliateEligibilityRound {
    function readyForNextRound() external view returns (bool);
    function saleStartAt() external view returns (uint256);
    function CONTRACT_VERSION() external view returns (string memory);
    function ALGORITHM_VERSION() external view returns (string memory);
    function roundId() external view returns (uint256);
    function owner() external view returns (address);
    function maxSupply() external view returns (uint256);
    function mintDeadline() external view returns (uint256);
    function totalMinted() external view returns (uint256);
    function saleActivated() external view returns (bool);
    function prizePaid() external view returns (bool);
    function revealed() external view returns (bool);
    function soldOut() external view returns (bool);
    function refundsAvailable() external view returns (bool);
    function affiliateEligibility() external view returns (address);
    function affiliatePoolBps() external view returns (uint256);
    function enrollmentSigner() external view returns (address);
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @notice Canonical collection ordering and NFT-backed affiliate admission shared by every official factory.
/// @dev Governance approves reviewed factory runtimes and selects official collections, never individual applicants.
/// The sole bootstrap is sequence 1. After it, each admission consumes one still-owned ticket from any earlier
/// completed official collection for this destination only. Transfers after admission do not revoke earnings.
contract ManekinekoAffiliateEligibilityV2 is Ownable2Step, ReentrancyGuard {
    string public constant ELIGIBILITY_VERSION = "affiliate-eligibility-v2";
    bytes32 public constant ENROLLMENT_TYPEHASH = keccak256("Enrollment(address applicant,uint256 affiliateId,uint256 poolBps,address sourceCollection,uint256 sourceTokenId,bytes32 nonce,uint256 deadline)");
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant NAME_HASH = keccak256("ManekinekoAffiliateEnrollment");
    bytes32 private constant VERSION_HASH = keccak256("4");

    struct Collection {
        address factory;
        uint256 roundId;
        uint256 sequence;
        bytes32 codeHash;
        bool sourceOnly;
    }

    mapping(address => bytes32) public approvedFactoryCodeHash;
    mapping(address => Collection) public collections;
    mapping(address => mapping(address => mapping(uint256 => bool))) public usedToken;
    mapping(address => mapping(bytes32 => bool)) public enrollmentNonceUsed;
    uint256 public collectionCount;
    address public lastCollection;

    error InvalidFactory();
    error FactoryAlreadyApproved();
    error InvalidCollection();
    error CollectionAlreadyRegistered();
    error CollectionNotRegistered();
    error PreviousCollectionUnfinished();
    error EligibilityRequired(uint8 status);
    error InvalidEnrollment();
    error EnrollmentNonceUsed();
    error OwnershipRenunciationDisabled();

    event FactoryApproved(address indexed factory, bytes32 codeHash);
    event CollectionRegistered(address indexed round, address indexed factory, uint256 roundId, uint256 sequence, bool sourceOnly);
    event EligibilityConsumed(address indexed target, address indexed applicant, address indexed sourceCollection, uint256 sourceTokenId, uint256 affiliateId, bytes32 nonce);

    constructor(address initialOwner) Ownable(initialOwner) {}

    function approveFactory(address factory, bytes32 expectedCodeHash) external onlyOwner {
        if (approvedFactoryCodeHash[factory] != bytes32(0)) revert FactoryAlreadyApproved();
        if (factory.code.length == 0 || expectedCodeHash == bytes32(0) || factory.codehash != expectedCodeHash) revert InvalidFactory();
        approvedFactoryCodeHash[factory] = expectedCodeHash;
        emit FactoryApproved(factory, expectedCodeHash);
    }

    /// @notice Append an official round across all factories. A definitively failed round may be followed by another.
    /// @dev Existing V5/V6 rounds can only be imported after successful completion and can never enroll through this gate.
    function registerCollection(address factory, uint256 id) external onlyOwner nonReentrant returns (address round) {
        _checkFactory(factory);
        round = IAffiliateEligibilityFactory(factory).rounds(id);
        if (collections[round].sequence != 0) revert CollectionAlreadyRegistered();
        if (round.code.length == 0 || id == 0) revert InvalidCollection();
        if (lastCollection != address(0)) {
            _checkedCollection(lastCollection);
            IAffiliateEligibilityRound previous = IAffiliateEligibilityRound(lastCollection);
            if (!_completed(previous) && !previous.refundsAvailable()) revert PreviousCollectionUnfinished();
        }
        IAffiliateEligibilityRound candidate = IAffiliateEligibilityRound(round);
        bytes32 version = keccak256(bytes(candidate.CONTRACT_VERSION()));
        bool sourceOnly = version == keccak256("affiliate-v5") || (version == keccak256("affiliate-v6") && _completed(candidate));
        if (candidate.roundId() != id || candidate.owner() == address(0) || candidate.maxSupply() == 0) revert InvalidCollection();
        if (sourceOnly) {
            if (keccak256(bytes(candidate.ALGORITHM_VERSION())) != (version == keccak256("affiliate-v5") ? keccak256("unique-rank-v2") : keccak256("unique-rank-v3")) || !_completed(candidate)) revert InvalidCollection();
        } else {
            bool supported = (version == keccak256("affiliate-v6") && keccak256(bytes(candidate.ALGORITHM_VERSION())) == keccak256("unique-rank-v3")) ||
                (version == keccak256("affiliate-v7") && keccak256(bytes(candidate.ALGORITHM_VERSION())) == keccak256("unique-rank-v4"));
            if (!supported ||
                candidate.affiliateEligibility() != address(this) || candidate.saleActivated() || candidate.totalMinted() != 0 ||
                candidate.prizePaid() || candidate.refundsAvailable() || candidate.mintDeadline() <= block.timestamp) revert InvalidCollection();
        }
        uint256 sequence = ++collectionCount;
        collections[round] = Collection(factory, id, sequence, round.codehash, sourceOnly);
        lastCollection = round;
        emit CollectionRegistered(round, factory, id, sequence, sourceOnly);
    }

    /// @notice Called by a bound round before activating sales; arbitrary or unregistered rounds cannot bypass admission.
    function requireRegistered(address target) external view {
        if (_checkedCollection(target).sourceOnly) revert InvalidCollection();
    }

    /// @notice 0 eligible; 1 no target; 2 wrong source; 3 not holder; 4 used; 5 target closed; 6 source incomplete.
    /// @dev Broken pinned factory/round bindings revert rather than returning a misleading eligibility result.
    function eligibilityStatus(address target, address applicant, address sourceCollection, uint256 sourceTokenId) public view returns (uint8) {
        Collection storage destination = collections[target];
        if (destination.sequence == 0 || destination.sourceOnly) return 1;
        _checkedCollection(target);
        IAffiliateEligibilityRound targetRound = IAffiliateEligibilityRound(target);
        bool v7 = keccak256(bytes(targetRound.CONTRACT_VERSION())) == keccak256("affiliate-v7");
        if ((v7 ? block.timestamp >= targetRound.saleStartAt() : targetRound.saleActivated()) || targetRound.refundsAvailable() || block.timestamp >= targetRound.mintDeadline()) return 5;
        if (applicant == address(0)) return 3;
        if (destination.sequence == 1) return sourceCollection == address(0) && sourceTokenId == 0 ? 0 : 2;
        Collection storage source = collections[sourceCollection];
        if (source.sequence == 0 || source.sequence >= destination.sequence || sourceTokenId == 0) return 2;
        _checkedCollection(sourceCollection);
        IAffiliateEligibilityRound sourceRound = IAffiliateEligibilityRound(sourceCollection);
        if (!_completed(sourceRound)) return 6;
        if (usedToken[target][sourceCollection][sourceTokenId]) return 4;
        try sourceRound.ownerOf(sourceTokenId) returns (address holder) {
            return holder == applicant ? 0 : 3;
        } catch { return 3; }
    }

    /// @notice Only the registered destination contract can verify and consume its bound permit and eligibility NFT.
    function consumeEnrollment(address applicant, uint256 affiliateId, uint256 poolBps, address sourceCollection, uint256 sourceTokenId, bytes32 nonce, uint256 deadline, bytes calldata signature) external nonReentrant {
        {
            uint8 status = eligibilityStatus(msg.sender, applicant, sourceCollection, sourceTokenId);
            if (status != 0) revert EligibilityRequired(status);
            IAffiliateEligibilityRound target = IAffiliateEligibilityRound(msg.sender);
            if (deadline < block.timestamp || deadline > target.mintDeadline() || poolBps != target.affiliatePoolBps()) revert InvalidEnrollment();
            if (enrollmentNonceUsed[msg.sender][nonce]) revert EnrollmentNonceUsed();
            bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, NAME_HASH, VERSION_HASH, block.chainid, msg.sender));
            bytes32 structHash = keccak256(abi.encode(ENROLLMENT_TYPEHASH, applicant, affiliateId, poolBps, sourceCollection, sourceTokenId, nonce, deadline));
            bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
            if (ECDSA.recover(digest, signature) != target.enrollmentSigner()) revert InvalidEnrollment();
        }
        enrollmentNonceUsed[msg.sender][nonce] = true;
        if (sourceCollection != address(0)) usedToken[msg.sender][sourceCollection][sourceTokenId] = true;
        emit EligibilityConsumed(msg.sender, applicant, sourceCollection, sourceTokenId, affiliateId, nonce);
    }

    function renounceOwnership() public view override onlyOwner { revert OwnershipRenunciationDisabled(); }

    function _completed(IAffiliateEligibilityRound round) private view returns (bool) {
        if (keccak256(bytes(round.CONTRACT_VERSION())) == keccak256("affiliate-v7")) return round.readyForNextRound();
        return round.prizePaid() && round.soldOut() && round.revealed();
    }
    function _checkFactory(address factory) private view {
        bytes32 expected = approvedFactoryCodeHash[factory];
        if (expected == bytes32(0) || factory.codehash != expected) revert InvalidFactory();
    }
    function _checkedCollection(address round) private view returns (Collection storage info) {
        info = collections[round];
        if (info.sequence == 0) revert CollectionNotRegistered();
        _checkFactory(info.factory);
        if (round.codehash != info.codeHash || IAffiliateEligibilityFactory(info.factory).rounds(info.roundId) != round) revert InvalidCollection();
    }
}
