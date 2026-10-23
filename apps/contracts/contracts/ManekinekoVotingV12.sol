// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Checkpoints} from "@openzeppelin/contracts/utils/structs/Checkpoints.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IVotingRoundV12 {
    function readyForNextRound() external view returns (bool);
    function finalizedAt() external view returns (uint256);
}

/// @notice One vote per NFT held at the timestamp immediately before voting opens.
/// New rounds checkpoint every transfer. Historical NFTs opt into escrow before the snapshot.
/// Only successfully revealed, fully backed official collections qualify. No backend attestation.
contract ManekinekoVotingV12 is ReentrancyGuard {
    using Checkpoints for Checkpoints.Trace208;
    struct Terms { uint256 supply; uint256 price; uint256 winners; uint256 duration; }
    struct Ballot { uint48 startsAt; uint48 endsAt; uint256 totalVotes; uint256 sequence; }
    address public immutable controller;
    bool public immutable bootstrapAllowed;
    uint256 public constant MIN_MINT_PRICE = 0.01 ether;
    uint256 public constant MIN_SUPPLY = 1_000;
    uint256 public constant MAX_OPTIONS = 8;
    uint256 public constant MAX_SOURCES_PER_VOTE = 16;
    mapping(address => Ballot) public ballots;
    mapping(address => Terms[]) private options;
    mapping(address => mapping(uint256 => uint256)) public votes;
    mapping(address => mapping(address => mapping(address => bool))) public sourceVoted;
    mapping(address => mapping(address => Checkpoints.Trace208)) private balances;
    mapping(address => bool) public legacySource;
    address[] public legacySources;
    function legacySourceCount() external view returns (uint256) { return legacySources.length; }
    mapping(address => mapping(uint256 => address)) public escrowOwner;
    mapping(address => mapping(address => mapping(uint256 => bool))) public eligibilityUsed;
    event BallotOpened(address indexed round, uint48 startsAt, uint48 endsAt, uint256 sequence);
    event VoteCast(address indexed round, address indexed voter, uint256 indexed option, uint256 weight);
    event LegacyDeposited(address indexed source, address indexed holder, uint256 tokenId);
    event LegacyWithdrawn(address indexed source, address indexed holder, uint256 tokenId);
    event LegacySourceRegistered(address indexed source);
    error InvalidTerms();
    error Unauthorized();
    error InvalidBallot();
    error InvalidSource();
    error AlreadyVoted();
    error NotEligible();

    constructor(address protocol, bool allowBootstrap) {
        if (protocol == address(0)) revert Unauthorized();
        controller = protocol;
        bootstrapAllowed = allowBootstrap;
    }
    modifier onlyController() { if (msg.sender != controller) revert Unauthorized(); _; }

    function validateTerms(Terms memory t) public pure {
        if (t.supply < MIN_SUPPLY || t.supply > 65_536 || t.price < MIN_MINT_PRICE || t.price % 10_000 != 0 ||
            t.price > type(uint256).max / t.supply || t.winners == 0 || t.winners > 10 ||
            t.winners > t.supply || 6000 % t.winners != 0 || t.duration < 1 hours || t.duration > 24 hours)
            revert InvalidTerms();
    }
    function openBallot(address round, Terms[] calldata choices, uint48 start, uint48 end, uint256 sequence) external onlyController {
        if (round.code.length == 0 || ballots[round].sequence != 0 || choices.length == 0 || choices.length > MAX_OPTIONS ||
            start <= block.timestamp || end <= start || sequence == 0) revert InvalidBallot();
        for (uint256 i; i < choices.length; ++i) {
            validateTerms(choices[i]);
            for (uint256 j; j < i; ++j) if (keccak256(abi.encode(choices[i])) == keccak256(abi.encode(choices[j]))) revert InvalidTerms();
            options[round].push(choices[i]);
        }
        ballots[round] = Ballot(start, end, 0, sequence);
        emit BallotOpened(round, start, end, sequence);
    }
    function registerLegacySource(address source) external onlyController {
        if (legacySources.length >= 256 || source.code.length == 0 || legacySource[source] || !IVotingRoundV12(source).readyForNextRound()) revert InvalidSource();
        legacySource[source] = true;
        legacySources.push(source);
        emit LegacySourceRegistered(source);
    }
    function optionCount(address round) external view returns (uint256) { return options[round].length; }
    function option(address round, uint256 index) external view returns (Terms memory) { return options[round][index]; }
    /// @notice Option zero is the published no-vote fallback. Ties use lowest option index.
    /// This bounded result becomes final at endsAt without any finalization transaction.
    function winningOption(address round) public view returns (uint256 winner) {
        if (ballots[round].sequence == 0) revert InvalidBallot();
        uint256 best;
        for (uint256 i; i < options[round].length; ++i) if (votes[round][i] > best) { best = votes[round][i]; winner = i; }
    }
    function effectiveTerms(address round) external view returns (Terms memory) { return options[round][winningOption(round)]; }
    function termsHash(address round) external view returns (bytes32) { return keccak256(abi.encode(options[round][winningOption(round)])); }
    function recordTransfer(address from, address to) external {
        if (ballots[msg.sender].sequence == 0) revert Unauthorized();
        _move(msg.sender, from, to);
    }
    function _move(address source, address from, address to) private {
        if (from != address(0)) balances[source][from].push(uint48(block.timestamp), balances[source][from].latest() - 1);
        if (to != address(0)) balances[source][to].push(uint48(block.timestamp), balances[source][to].latest() + 1);
    }
    function pastBalance(address source, address holder, uint48 timestamp) public view returns (uint256) {
        if (timestamp >= block.timestamp) revert InvalidBallot();
        return balances[source][holder].upperLookupRecent(timestamp);
    }
    function eligibleSource(address source, uint48 snapshot) public view returns (bool) {
        if (!legacySource[source] && ballots[source].sequence == 0) return false;
        uint256 finalized = IVotingRoundV12(source).finalizedAt();
        return finalized != 0 && finalized <= snapshot && IVotingRoundV12(source).readyForNextRound();
    }
    function votingPower(address round, address holder, address source) public view returns (uint256) {
        Ballot memory b = ballots[round];
        if (b.sequence == 0 || block.timestamp < b.startsAt || sourceVoted[round][holder][source] || !eligibleSource(source, b.startsAt - 1)) return 0;
        return pastBalance(source, holder, b.startsAt - 1);
    }
    function castVote(address round, uint256 choice, address[] calldata sources) external nonReentrant {
        Ballot storage b = ballots[round];
        if (b.sequence == 0 || block.timestamp < b.startsAt || block.timestamp >= b.endsAt || choice >= options[round].length ||
            sources.length == 0 || sources.length > MAX_SOURCES_PER_VOTE) revert InvalidBallot();
        uint256 weight;
        for (uint256 i; i < sources.length; ++i) {
            address source = sources[i];
            if (sourceVoted[round][msg.sender][source]) revert AlreadyVoted();
            uint256 units = votingPower(round, msg.sender, source);
            if (units == 0) revert NotEligible();
            sourceVoted[round][msg.sender][source] = true;
            weight += units;
        }
        votes[round][choice] += weight;
        b.totalVotes += weight;
        emit VoteCast(round, msg.sender, choice, weight);
    }
    /// @notice Consumed by the registered target. One source NFT per target; no server permit.
    function consumeEligibility(address applicant, address source, uint256 tokenId) external {
        Ballot memory b = ballots[msg.sender];
        if (b.sequence == 0 || block.timestamp < b.startsAt || block.timestamp >= b.endsAt) revert NotEligible();
        if (bootstrapAllowed && b.sequence == 1 && source == address(0) && tokenId == 0) return;
        if (source == msg.sender || !eligibleSource(source, uint48(block.timestamp)) || eligibilityUsed[msg.sender][source][tokenId]) revert NotEligible();
        if (IERC721(source).ownerOf(tokenId) != applicant && escrowOwner[source][tokenId] != applicant) revert NotEligible();
        eligibilityUsed[msg.sender][source][tokenId] = true;
    }
    function depositLegacy(address source, uint256[] calldata ids) external nonReentrant {
        if (!legacySource[source] || ids.length == 0 || ids.length > 20) revert InvalidSource();
        for (uint256 i; i < ids.length; ++i) {
            if (IERC721(source).ownerOf(ids[i]) != msg.sender || escrowOwner[source][ids[i]] != address(0)) revert NotEligible();
            escrowOwner[source][ids[i]] = msg.sender;
            IERC721(source).transferFrom(msg.sender, address(this), ids[i]);
            _move(source, address(0), msg.sender);
            emit LegacyDeposited(source, msg.sender, ids[i]);
        }
    }
    function withdrawLegacy(address source, uint256[] calldata ids) external nonReentrant {
        if (ids.length == 0 || ids.length > 20) revert InvalidSource();
        for (uint256 i; i < ids.length; ++i) {
            if (escrowOwner[source][ids[i]] != msg.sender) revert NotEligible();
            delete escrowOwner[source][ids[i]];
            _move(source, msg.sender, address(0));
            IERC721(source).safeTransferFrom(address(this), msg.sender, ids[i]);
            emit LegacyWithdrawn(source, msg.sender, ids[i]);
        }
    }
}
