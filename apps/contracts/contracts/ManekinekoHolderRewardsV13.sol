// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface IHolderControllerV13 {
    function catalogSealed() external view returns (bool);
    function rounds(uint256 id) external view returns (address);
    function seasonFirstRound(bytes32 seasonId) external view returns (uint256);
    function seasonLastRound(bytes32 seasonId) external view returns (uint256);
}
interface IHolderRoundV13 {
    function roundId() external view returns (uint256);
    function seasonId() external view returns (bytes32);
    function revealed() external view returns (bool);
    function refundsAvailable() external view returns (bool);
    function totalMinted() external view returns (uint256);
    function totalMintRevenue() external view returns (uint256);
    function ownerOf(uint256 tokenId) external view returns (address);
}

/// @notice Season ETH held exclusively for the first 5% of eligible NFTs to claim.
/// No administrator, withdrawal, pause, deadline extension or replacement pool.
contract ManekinekoHolderRewardsV13 is ReentrancyGuard {
    string public constant CONTRACT_VERSION = "holder-rewards-v13";
    uint256 public constant HOLDER_BPS = 1000;
    uint256 public constant COVERAGE_BPS = 500;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    IHolderControllerV13 public immutable controller;
    struct Pool { uint256 funded; uint256 eligibleNfts; uint256 claims; uint256 paid; }
    struct Summary {
        uint256 funded;
        uint256 eligibleNfts;
        uint256 claimLimit;
        uint256 rewardPerNft;
        uint256 claims;
        uint256 paid;
        uint256 collections;
        uint256 settledCollections;
        bool unlocked;
    }
    mapping(bytes32 => Pool) public pools;
    mapping(address => bool) public fundedCollection;
    mapping(address => mapping(uint256 => bool)) public claimed;
    error InvalidCollection();
    error InvalidFunding();
    error SeasonLocked();
    error ClaimsExhausted();
    error AlreadyClaimed();
    error NotTokenHolder();
    error InvalidRecipient();
    error TransferFailed();
    event HolderPoolFunded(bytes32 indexed seasonId, address indexed collection, uint256 amount, uint256 eligibleNfts);
    event HolderRewardClaimed(bytes32 indexed seasonId, address indexed collection, uint256 indexed tokenId, address holder, address recipient, uint256 amount);

    constructor(address protocol) {
        if (protocol.code.length == 0) revert InvalidCollection();
        controller = IHolderControllerV13(protocol);
    }

    /// @dev Called atomically by an official round's successful draw. Refundable
    /// receipts never leave their round. Donations cannot enlarge entitlements.
    function fund() external payable nonReentrant {
        IHolderRoundV13 round = IHolderRoundV13(msg.sender);
        uint256 id = round.roundId();
        bytes32 season = round.seasonId();
        if (!controller.catalogSealed() || controller.rounds(id) != msg.sender || fundedCollection[msg.sender]
            || id < controller.seasonFirstRound(season) || id > controller.seasonLastRound(season)
            || !round.revealed() || round.refundsAvailable()) revert InvalidCollection();
        uint256 amount = (round.totalMintRevenue() / BPS_DENOMINATOR) * HOLDER_BPS;
        uint256 count = round.totalMinted();
        if (amount == 0 || msg.value != amount || count == 0) revert InvalidFunding();
        fundedCollection[msg.sender] = true;
        pools[season].funded += amount;
        pools[season].eligibleNfts += count;
        emit HolderPoolFunded(season, msg.sender, amount, count);
    }

    /// @notice At most ten collections. A season ends after every planned
    /// collection reveals or becomes refundable, regardless of unpaid prizes.
    function summary(bytes32 season) public view returns (Summary memory result) {
        Pool memory pool = pools[season];
        uint256 first = controller.seasonFirstRound(season);
        uint256 last = controller.seasonLastRound(season);
        result.funded = pool.funded;
        result.eligibleNfts = pool.eligibleNfts;
        result.claimLimit = pool.eligibleNfts * COVERAGE_BPS / BPS_DENOMINATOR;
        result.rewardPerNft = result.claimLimit == 0 ? 0 : pool.funded / result.claimLimit;
        result.claims = pool.claims;
        result.paid = pool.paid;
        if (first == 0 || last < first || last - first >= 10 || !controller.catalogSealed()) return result;
        result.collections = last - first + 1;
        for (uint256 id = first; id <= last; ++id) {
            address collection = controller.rounds(id);
            if (collection == address(0)) continue;
            IHolderRoundV13 round = IHolderRoundV13(collection);
            if ((round.revealed() && fundedCollection[collection]) || round.refundsAvailable()) ++result.settledCollections;
        }
        result.unlocked = result.settledCollections == result.collections;
    }

    /// @notice Current owner only, once per NFT across all subsequent transfers.
    /// Executed transaction order determines the first floor(eligible NFTs / 20)
    /// claims. Equal floor(pool / claimLimit) payouts leave only wei rounding dust.
    function claim(address collection, uint256 tokenId, address payable recipient) external nonReentrant {
        if (!fundedCollection[collection]) revert InvalidCollection();
        IHolderRoundV13 round = IHolderRoundV13(collection);
        bytes32 season = round.seasonId();
        Summary memory state = summary(season);
        if (!state.unlocked) revert SeasonLocked();
        if (claimed[collection][tokenId]) revert AlreadyClaimed();
        if (round.ownerOf(tokenId) != msg.sender) revert NotTokenHolder();
        if (recipient == address(0) || recipient == address(this) || recipient == collection) revert InvalidRecipient();
        if (state.claims >= state.claimLimit || state.rewardPerNft == 0) revert ClaimsExhausted();
        claimed[collection][tokenId] = true;
        ++pools[season].claims;
        pools[season].paid += state.rewardPerNft;
        (bool ok,) = recipient.call{value: state.rewardPerNft}("");
        if (!ok) revert TransferFailed();
        emit HolderRewardClaimed(season, collection, tokenId, msg.sender, recipient, state.rewardPerNft);
    }
}
