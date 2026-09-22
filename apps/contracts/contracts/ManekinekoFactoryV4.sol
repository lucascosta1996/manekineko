// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ManekinekoRoundV4} from "./ManekinekoRoundV4.sol";
import {ManekinekoRoundDeployerV4} from "./ManekinekoRoundDeployerV4.sol";
import {ManekinekoRendererV4} from "./ManekinekoRendererV4.sol";

/// @notice V4 configurable affiliate round registry. Failed/unsold rounds do not satisfy the successful-series rollover rule.
contract ManekinekoFactoryV4 is Ownable2Step {
    ManekinekoRendererV4 public immutable renderer;
    ManekinekoRoundDeployerV4 public immutable deployer;
    uint256 public roundCount;
    mapping(uint256 => address) public rounds;
    error PreviousRoundIncomplete();
    error InvalidRoundId();
    error OwnershipRenunciationDisabled();
    event RoundCreated(uint256 indexed roundId, address indexed round, address indexed roundOwner);
    constructor(address initialOwner) Ownable(initialOwner) { renderer = new ManekinekoRendererV4(); deployer = new ManekinekoRoundDeployerV4(); }

    function createRound(ManekinekoRoundV4.Config calldata config) external onlyOwner returns (address round) {
        if (roundCount != 0 && !ManekinekoRoundV4(rounds[roundCount]).readyForNextRound()) revert PreviousRoundIncomplete();
        if (config.roundId != roundCount + 1) revert InvalidRoundId();
        round = deployer.deploy(config, address(renderer));
        rounds[++roundCount] = round;
        emit RoundCreated(roundCount, round, config.initialOwner);
    }
    function renounceOwnership() public view override onlyOwner { revert OwnershipRenunciationDisabled(); }
}
