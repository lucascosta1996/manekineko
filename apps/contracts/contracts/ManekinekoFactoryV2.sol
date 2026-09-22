// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ManekinekoRoundV2} from "./ManekinekoRoundV2.sol";

/// @notice V2 round registry. Failed/unsold rounds do not satisfy the successful-series rollover rule.
contract ManekinekoFactoryV2 is Ownable2Step {
    uint256 public roundCount;
    mapping(uint256 => address) public rounds;
    error PreviousRoundIncomplete();
    error InvalidRoundId();
    error OwnershipRenunciationDisabled();
    event RoundCreated(uint256 indexed roundId, address indexed round, address indexed roundOwner);
    constructor(address initialOwner) Ownable(initialOwner) {}

    function createRound(ManekinekoRoundV2.Config calldata config) external onlyOwner returns (address round) {
        if (roundCount != 0 && !ManekinekoRoundV2(rounds[roundCount]).readyForNextRound()) revert PreviousRoundIncomplete();
        if (config.roundId != roundCount + 1) revert InvalidRoundId();
        round = address(new ManekinekoRoundV2(config));
        rounds[++roundCount] = round;
        emit RoundCreated(roundCount, round, config.initialOwner);
    }
    function renounceOwnership() public view override onlyOwner { revert OwnershipRenunciationDisabled(); }
}
