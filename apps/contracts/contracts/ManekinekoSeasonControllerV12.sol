// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ManekinekoV12Policy} from "./ManekinekoV12Policy.sol";
import {ManekinekoRoundV12} from "./ManekinekoRoundV12.sol";
import {ManekinekoRoundDeployerV12} from "./ManekinekoRoundDeployerV12.sol";
import {ManekinekoRendererV11} from "./ManekinekoRendererV11.sol";
import {ManekinekoVotingV12} from "./ManekinekoVotingV12.sol";
import {ManekinekoWinnerCreditsV8} from "./ManekinekoWinnerCreditsV8.sol";

/// @notice Immutable season order, deadline openings and a bounded permissionless preparation step.
/// The operator publishes/seals the catalog once. No account can pause or rewrite a live collection.
/// Preparation/funding occurs BETWEEN sales; no database, X post or operator activation gates minting.
contract ManekinekoSeasonControllerV12 is ReentrancyGuard {
    struct CollectionPlan {
        bytes32 seasonId;
        string seasonName;
        string name;
        string symbol;
        string color;
        string textColor;
    }
    struct Settings {
        address operator;
        address coordinator;
        address credits;
        bytes32 keyHash;
        uint16 confirmations;
        uint32 callbackGas;
        uint48 votingDuration;
        uint48 votingDelay;
        uint256 randomnessBudget;
        uint256 sponsorshipBudget;
        bool bootstrapAllowed;
    }
    string public constant CONTRACT_VERSION = "season-controller-v12";
    address public immutable operator;
    ManekinekoVotingV12 public immutable voting;
    ManekinekoRendererV11 public immutable renderer;
    ManekinekoWinnerCreditsV8 public immutable credits;
    ManekinekoRoundDeployerV12 public deployer;
    Settings public settings;
    CollectionPlan[] private catalog;
    ManekinekoVotingV12.Terms[] private choices;
    mapping(bytes32 => uint256) public seasonCollectionCount;
    mapping(bytes32 => bytes32) public seasonNameHash;
    mapping(uint256 => address) public rounds;
    uint256 public roundCount;
    bool public catalogSealed;
    uint256 public constant AFFILIATE_POSITIONS = 10;
    event CatalogCollectionAdded(uint256 indexed index, bytes32 indexed seasonId, string name);
    event CatalogSealed(uint256 collectionCount, bytes32 optionsHash);
    event RoundCreated(uint256 indexed roundId, address indexed round, address indexed roundOwner);
    event SeasonCollectionCreated(bytes32 indexed seasonId, uint256 indexed roundId, address indexed round, uint256 seasonPosition, string seasonName);
    event CollectionPrepared(uint256 indexed roundId, address indexed round, uint48 voteStart, uint48 voteEnd);
    event OperatingFundsReceived(address indexed funder, uint256 amount);
    event CollectionSettled(uint256 indexed roundId, address indexed round, uint256 operatorProceeds, address nextRound);
    error Unauthorized();
    error InvalidConfiguration();
    error CatalogLocked();
    error SaleStillOpen();
    error InsufficientOperatingFunds();
    error CatalogComplete();
    error CollectionChanged();
    error OperatorProceedsChanged();
    error InvalidOperatingTopUp();
    error DrawNeedsProgress();

    constructor(Settings memory config, ManekinekoVotingV12.Terms[] memory candidates) {
        if (config.operator == address(0) || config.credits.code.length == 0 || config.coordinator.code.length == 0 ||
            config.votingDuration < 1 hours || config.votingDuration > 7 days || config.votingDelay < 60 ||
            config.votingDelay > 1 days || config.randomnessBudget == 0 || candidates.length == 0 || candidates.length > 8)
            revert InvalidConfiguration();
        operator = config.operator;
        settings = config;
        credits = ManekinekoWinnerCreditsV8(config.credits);
        if (keccak256(bytes(credits.WINNER_CREDITS_VERSION())) != keccak256("winner-credits-v8") || credits.owner() != config.operator)
            revert InvalidConfiguration();
        if (config.bootstrapAllowed && (address(credits.previousRegistry()) != address(0) ||
            credits.legacyMerkleRoot() != bytes32(0))) revert InvalidConfiguration();
        voting = new ManekinekoVotingV12(address(this), config.bootstrapAllowed);
        renderer = new ManekinekoRendererV11();
        for (uint256 i; i < candidates.length; ++i) {
            voting.validateTerms(candidates[i]);
            for (uint256 j; j < i; ++j) if (keccak256(abi.encode(candidates[i])) == keccak256(abi.encode(candidates[j]))) revert InvalidConfiguration();
            choices.push(candidates[i]);
        }
    }
    modifier onlyOperator() { if (msg.sender != operator) revert Unauthorized(); _; }
    receive() external payable { emit OperatingFundsReceived(msg.sender, msg.value); }
    function catalogCount() external view returns (uint256) { return catalog.length; }
    function collectionPlan(uint256 index) external view returns (CollectionPlan memory) { return catalog[index]; }
    function optionCount() external view returns (uint256) { return choices.length; }
    function option(uint256 index) external view returns (ManekinekoVotingV12.Terms memory) { return choices[index]; }
    function preparationCost() public view returns (uint256) { return settings.randomnessBudget + settings.sponsorshipBudget + ManekinekoV12Policy.EXECUTION_REWARD; }
    function bindDeployer(address candidate) external onlyOperator {
        if (catalogSealed || address(deployer) != address(0) || candidate.code.length == 0 ||
            ManekinekoRoundDeployerV12(candidate).factory() != address(this)) revert InvalidConfiguration();
        deployer = ManekinekoRoundDeployerV12(candidate);
    }
    /// @notice Batch uploads preserve the exact submitted identities/order. Immutable after sealing.
    function appendCollections(CollectionPlan[] calldata plans) external onlyOperator {
        if (catalogSealed) revert CatalogLocked();
        if (plans.length == 0 || plans.length > 10 || catalog.length + plans.length > 256) revert InvalidConfiguration();
        for (uint256 i; i < plans.length; ++i) {
            CollectionPlan calldata p = plans[i];
            if (p.seasonId == bytes32(0) || bytes(p.symbol).length == 0 || bytes(p.symbol).length > 16 || seasonCollectionCount[p.seasonId] >= 10)
                revert InvalidConfiguration();
            renderer.validateAppearance(p.seasonName, p.name, p.color, p.textColor);
            bytes32 nameHash = keccak256(bytes(p.seasonName));
            if (seasonCollectionCount[p.seasonId] != 0 && (seasonNameHash[p.seasonId] != nameHash || catalog[catalog.length - 1].seasonId != p.seasonId))
                revert InvalidConfiguration();
            seasonNameHash[p.seasonId] = nameHash;
            ++seasonCollectionCount[p.seasonId];
            catalog.push(p);
            emit CatalogCollectionAdded(catalog.length - 1, p.seasonId, p.name);
        }
    }
    /// @notice Historical sources must already be registered in the compatible credits registry.
    /// Import is setup-only and disables any assumption of a fresh first-season eligibility exemption.
    function importVotingSource(address source) external onlyOperator {
        if (catalogSealed || settings.bootstrapAllowed) revert CatalogLocked();
        (address factory, uint256 id, uint256 sequence,, bytes32 codeHash,) = credits.collections(source);
        if (sequence == 0 || source.codehash != codeHash || credits.approvedFactoryCodeHash(factory) != factory.codehash) revert InvalidConfiguration();
        (bool ok, bytes memory result) = factory.staticcall(abi.encodeWithSignature("rounds(uint256)", id));
        if (!ok || abi.decode(result, (address)) != source) revert InvalidConfiguration();
        voting.registerLegacySource(source);
    }
    function sealCatalog() external onlyOperator {
        if (catalogSealed || catalog.length == 0 || address(deployer) == address(0) || !credits.factoriesSealed() ||
            credits.approvedFactoryCodeHash(address(this)) != address(this).codehash)
            revert InvalidConfiguration();
        if (settings.bootstrapAllowed && credits.collectionCount() != 0) revert InvalidConfiguration();
        catalogSealed = true;
        emit CatalogSealed(catalog.length, keccak256(abi.encode(choices)));
    }
    /// @notice Anyone can prepare the next predetermined collection after the preceding sale closes.
    /// It deploys/registers/funds atomically before publishing a vote deadline. No authority remains to delay opening.
    function prepareNext() external payable nonReentrant returns (address round) {
        if (msg.value != 0) emit OperatingFundsReceived(msg.sender, msg.value);
        return _prepareNext();
    }
    /// @notice One operator transaction settles the latest outcome and prepares the next ballot.
    /// All steps revert together. Expected identity/proceeds prevent a stale approval from settling another round.
    /// The exact optional top-up is separate from the full 20% payment and every protected mint liability.
    function settleAndPrepare(uint256 expectedRoundId, uint256 expectedOperatorProceeds)
        external payable onlyOperator nonReentrant returns (address nextRound)
    {
        if (!catalogSealed) revert CatalogLocked();
        if (expectedRoundId == 0 || expectedRoundId != roundCount) revert CollectionChanged();
        ManekinekoRoundV12 previous = ManekinekoRoundV12(rounds[expectedRoundId]);
        bool successful = previous.soldOut() && !previous.refundsAvailable();
        if (!successful && !previous.refundsAvailable()) revert SaleStillOpen();
        uint256 needed = roundCount < catalog.length ? preparationCost() : 0;
        uint256 balanceBefore = address(this).balance - msg.value;
        uint256 shortfall = needed > balanceBefore ? needed - balanceBefore : 0;
        if (msg.value != shortfall) revert InvalidOperatingTopUp();
        if (msg.value != 0) emit OperatingFundsReceived(msg.sender, msg.value);
        if (successful && !previous.revealed()) {
            previous.finalizeDraw(previous.MAX_DRAW_ATTEMPTS());
            // Permissionless finalizeDraw remains available to persist a rejected batch's progress.
            if (!previous.revealed()) revert DrawNeedsProgress();
        }
        uint256 proceeds = previous.operatorWithdrawable();
        if (proceeds != expectedOperatorProceeds) revert OperatorProceedsChanged();
        if (proceeds != 0 || (previous.executionRecipient() == operator && previous.executionReserve() != 0))
            previous.withdrawOperatorToOperator();
        if (roundCount < catalog.length) nextRound = _prepareNext();
        emit CollectionSettled(expectedRoundId, address(previous), proceeds, nextRound);
    }
    function _prepareNext() private returns (address round) {
        if (!catalogSealed) revert CatalogLocked();
        if (roundCount == catalog.length) revert CatalogComplete();
        if (roundCount != 0) {
            ManekinekoRoundV12 previous = ManekinekoRoundV12(rounds[roundCount]);
            if (!previous.readyForNextRound() && !previous.refundsAvailable()) revert SaleStillOpen();
        }
        if (address(this).balance < preparationCost()) revert InsufficientOperatingFunds();
        CollectionPlan storage p = catalog[roundCount];
        uint48 start = uint48(block.timestamp) + settings.votingDelay;
        uint48 end = start + settings.votingDuration;
        ManekinekoRoundV12.Config memory config = ManekinekoRoundV12.Config(p.name, p.symbol, p.seasonId, p.seasonName, p.color, p.textColor,
            roundCount + 1, operator, address(voting), settings.coordinator, settings.keyHash, settings.confirmations, settings.callbackGas, AFFILIATE_POSITIONS, end);
        round = deployer.deploy(config, address(renderer));
        rounds[++roundCount] = round;
        voting.openBallot(round, choices, start, end, roundCount);
        credits.registerCollection(address(this), roundCount);
        ManekinekoRoundV12(round).fundRandomness{value: settings.randomnessBudget}();
        ManekinekoRoundV12(round).fundExecution{value: ManekinekoV12Policy.EXECUTION_REWARD}();
        if (settings.sponsorshipBudget != 0) credits.fundCollection{value: settings.sponsorshipBudget}(round);
        uint256 position;
        for (uint256 i = roundCount; i != 0 && catalog[i - 1].seasonId == p.seasonId; --i) ++position;
        emit RoundCreated(roundCount, round, operator);
        emit SeasonCollectionCreated(p.seasonId, roundCount, round, position, p.seasonName);
        emit CollectionPrepared(roundCount, round, start, end);
    }
    /// @notice Recover only unused controller operating funds, never any collection's liabilities.
    function withdrawOperatingFunds(uint256 amount) external onlyOperator nonReentrant {
        if (roundCount != catalog.length || amount == 0 || amount > address(this).balance) revert InvalidConfiguration();
        (bool ok,) = payable(operator).call{value: amount}("");
        if (!ok) revert InvalidConfiguration();
    }
}
