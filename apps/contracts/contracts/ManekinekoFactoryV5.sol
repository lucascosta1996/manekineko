// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ManekinekoRoundV5} from "./ManekinekoRoundV5.sol";
import {ManekinekoRoundDeployerV5} from "./ManekinekoRoundDeployerV5.sol";
import {ManekinekoRendererV5} from "./ManekinekoRendererV5.sol";

/// @notice V5 configurable affiliate round registry. Failed/unsold rounds do not satisfy the successful-series rollover rule.
contract ManekinekoFactoryV5 is Ownable2Step {
    ManekinekoRendererV5 public immutable renderer;
    ManekinekoRoundDeployerV5 public immutable deployer;
    uint256 public roundCount;
    mapping(uint256 => address) public rounds;
    error PreviousRoundIncomplete();
    error InvalidRoundId();
    error OwnershipRenunciationDisabled();
    event RoundCreated(uint256 indexed roundId, address indexed round, address indexed roundOwner);
    constructor(address initialOwner) Ownable(initialOwner) { renderer = new ManekinekoRendererV5(); deployer = new ManekinekoRoundDeployerV5(); }

    function createRound(ManekinekoRoundV5.Config calldata config) external onlyOwner returns (address round) {
        if (roundCount != 0 && !ManekinekoRoundV5(rounds[roundCount]).readyForNextRound()) revert PreviousRoundIncomplete();
        if (config.roundId != roundCount + 1) revert InvalidRoundId();
        round = deployer.deploy(config, address(renderer));
        rounds[++roundCount] = round;
        emit RoundCreated(roundCount, round, config.initialOwner);
    }
    function renounceOwnership() public view override onlyOwner { revert OwnershipRenunciationDisabled(); }
}
