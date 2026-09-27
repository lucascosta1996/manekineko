// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

interface IUnactivatedRoundV8 {
    function CONTRACT_VERSION() external view returns (string memory);
    function owner() external view returns (address);
    function pendingOwner() external view returns (address);
    function totalMinted() external view returns (uint256);
    function saleActivated() external view returns (bool);
    function acceptOwnership() external;
    function withdrawRandomnessFunding(address payable recipient) external;
}

/// @notice Irreversibly prevents activation of one never-activated, zero-mint V8 round.
/// @dev Has no activation, ownership-transfer, arbitrary-call, delegatecall or destruction path.
///      The old round and its history remain intact. Its own expiry rules still govern VRF recovery.
contract ManekinekoRetiredRoundOwner {
    string public constant RETIREMENT_VERSION = "unactivated-v8-retirement-v1";
    address public immutable retiredRound;
    address payable public immutable recoveryRecipient;

    error InvalidTarget();
    error InvalidOriginalOwner();
    error RoundAlreadyUsed();
    error OwnershipNotPending();
    error RetirementNotComplete();

    event RoundPermanentlyRetired(address indexed target, address indexed originalOwner);

    constructor(address round, address payable originalOwner) {
        if (round.code.length == 0) revert InvalidTarget();
        if (originalOwner == address(0) || originalOwner == round || originalOwner == address(this)) revert InvalidOriginalOwner();
        retiredRound = round;
        recoveryRecipient = originalOwner;
        _requireUnusedOriginalRound();
    }

    /// @notice Complete the original owner's explicit Ownable2Step transfer to this contract.
    /// @dev Anyone may complete it, but activation/mints or any owner change invalidate acceptance.
    function acceptRetirement() external {
        _requireUnusedOriginalRound();
        IUnactivatedRoundV8 round = IUnactivatedRoundV8(retiredRound);
        if (round.pendingOwner() != address(this)) revert OwnershipNotPending();
        round.acceptOwnership();
        if (round.owner() != address(this) || round.pendingOwner() != address(0)) revert RetirementNotComplete();
        emit RoundPermanentlyRetired(retiredRound, recoveryRecipient);
    }

    /// @notice After the V8 deadline, anyone may return the unused VRF balance to its original owner.
    /// @dev Recipient cannot be redirected; an early/repeated attempt reverts under the round's rules.
    function recoverRandomnessFunding() external {
        if (IUnactivatedRoundV8(retiredRound).owner() != address(this)) revert RetirementNotComplete();
        IUnactivatedRoundV8(retiredRound).withdrawRandomnessFunding(recoveryRecipient);
    }

    function _requireUnusedOriginalRound() private view {
        IUnactivatedRoundV8 round = IUnactivatedRoundV8(retiredRound);
        if (keccak256(bytes(round.CONTRACT_VERSION())) != keccak256("affiliate-v8")) revert InvalidTarget();
        if (round.owner() != recoveryRecipient) revert InvalidOriginalOwner();
        if (round.saleActivated() || round.totalMinted() != 0) revert RoundAlreadyUsed();
    }
}
