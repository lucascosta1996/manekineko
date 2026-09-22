// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ManekinekoRoundV3} from "./ManekinekoRoundV3.sol";
import {ManekinekoRendererV3} from "./ManekinekoRendererV3.sol";

/// @notice V3 affiliate round registry. Failed/unsold rounds do not satisfy the successful-series rollover rule.
contract ManekinekoFactoryV3 is Ownable2Step {
    ManekinekoRendererV3 public immutable renderer;
    uint256 public roundCount;
    mapping(uint256 => address) public rounds;
    error PreviousRoundIncomplete();
    error InvalidRoundId();
    error OwnershipRenunciationDisabled();
    event RoundCreated(uint256 indexed roundId, address indexed round, address indexed roundOwner);
    constructor(address initialOwner) Ownable(initialOwner) { renderer = new ManekinekoRendererV3(); }

    function createRound(ManekinekoRoundV3.Config calldata config) external onlyOwner returns (address round) {
        if (roundCount != 0 && !ManekinekoRoundV3(rounds[roundCount]).readyForNextRound()) revert PreviousRoundIncomplete();
        if (config.roundId != roundCount + 1) revert InvalidRoundId();
        round = address(new ManekinekoRoundV3(config, address(renderer)));
        rounds[++roundCount] = round;
        emit RoundCreated(roundCount, round, config.initialOwner);
    }
    function renounceOwnership() public view override onlyOwner { revert OwnershipRenunciationDisabled(); }
}
