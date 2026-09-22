// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ManekinekoRound} from "./ManekinekoRound.sol";

/// @notice Deployment registry ready for a future owner-controlled automation executor.
/// @dev A transaction is still required. Cancelled rounds intentionally do not satisfy the rollover gate.
contract ManekinekoFactory is Ownable2Step {
    uint256 public roundCount;
    mapping(uint256 => address) public rounds;

    error PreviousRoundIncomplete();
    error InvalidRoundId();
    error OwnershipRenunciationDisabled();
    event RoundCreated(uint256 indexed roundId, address indexed round, address indexed roundOwner);

    constructor(address initialOwner) Ownable(initialOwner) {}

    /// @notice Deploy the first round, or the next only after sellout AND actual prize delivery.
    /// @dev initialOwner is explicit; transferring factory ownership does not transfer existing rounds.
    function createRound(ManekinekoRound.Config calldata config) external onlyOwner returns (address round) {
        if (roundCount != 0 && !ManekinekoRound(rounds[roundCount]).readyForNextRound()) revert PreviousRoundIncomplete();
        if (config.roundId != roundCount + 1) revert InvalidRoundId();
        round = address(new ManekinekoRound(config));
        rounds[++roundCount] = round;
        emit RoundCreated(roundCount, round, config.initialOwner);
    }

    function renounceOwnership() public view override onlyOwner { revert OwnershipRenunciationDisabled(); }
}
