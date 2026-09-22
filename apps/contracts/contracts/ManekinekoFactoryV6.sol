// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ManekinekoRoundV6} from "./ManekinekoRoundV6.sol";
import {ManekinekoRoundDeployerV6} from "./ManekinekoRoundDeployerV6.sol";
import {ManekinekoRendererV6} from "./ManekinekoRendererV6.sol";

/// @notice V6 configurable affiliate round registry. Failed/unsold rounds do not satisfy the successful-series rollover rule.
contract ManekinekoFactoryV6 is Ownable2Step {
    ManekinekoRendererV6 public immutable renderer;
    ManekinekoRoundDeployerV6 public immutable deployer;
    uint256 public roundCount;
    mapping(uint256 => address) public rounds;
    uint256 public constant MAX_COLLECTIONS_PER_SEASON = 10;
    mapping(bytes32 => uint256) public seasonCollectionCount;
    mapping(bytes32 => bytes32) public seasonNameHash;
    error PreviousRoundIncomplete();
    error InvalidRoundId();
    error InvalidSeason();
    error SeasonFull();
    error SeasonNameMismatch();
    error OwnershipRenunciationDisabled();
    event RoundCreated(uint256 indexed roundId, address indexed round, address indexed roundOwner);
    event SeasonCollectionCreated(bytes32 indexed seasonId, uint256 indexed roundId, address indexed round, uint256 seasonPosition, string seasonName);
    constructor(address initialOwner) Ownable(initialOwner) { renderer = new ManekinekoRendererV6(); deployer = new ManekinekoRoundDeployerV6(); }

    function createRound(ManekinekoRoundV6.Config calldata config) external onlyOwner returns (address round) {
        if (roundCount != 0 && !ManekinekoRoundV6(rounds[roundCount]).readyForNextRound()) revert PreviousRoundIncomplete();
        if (config.roundId != roundCount + 1) revert InvalidRoundId();
        if (config.seasonId == bytes32(0)) revert InvalidSeason();
        uint256 count = seasonCollectionCount[config.seasonId];
        if (count == MAX_COLLECTIONS_PER_SEASON) revert SeasonFull();
        bytes32 nameHash = keccak256(bytes(config.seasonName));
        if (count != 0 && seasonNameHash[config.seasonId] != nameHash) revert SeasonNameMismatch();
        round = deployer.deploy(config, address(renderer));
        rounds[++roundCount] = round;
        seasonNameHash[config.seasonId] = nameHash;
        seasonCollectionCount[config.seasonId] = count + 1;
        emit RoundCreated(roundCount, round, config.initialOwner);
        emit SeasonCollectionCreated(config.seasonId, roundCount, round, count + 1, config.seasonName);
    }
    function renounceOwnership() public view override onlyOwner { revert OwnershipRenunciationDisabled(); }
}
