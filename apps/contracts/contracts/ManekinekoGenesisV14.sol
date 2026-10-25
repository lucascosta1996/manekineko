// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {ManekinekoVotingV14} from "./ManekinekoVotingV14.sol";

/// @title Tincta Genesis — the free collectible that starts the first vote
/// @notice One free primary mint per wallet, 1,000 NFTs in total, over 24 hours.
/// @dev This ERC-721 is deliberately outside the paid season catalog. Its holder at
/// the first ballot's ownership snapshot receives one vote per NFT. The voting
/// contract rejects Genesis for every later ballot, even if its first vote was unused.
/// Genesis has no prize, refund, affiliate, sponsored mint or holder-pool rights.
/// There is no owner mint, upgrade, pause, price setter or external artwork server.
contract ManekinekoGenesisV14 is ERC721, ReentrancyGuard {
    string public constant CONTRACT_VERSION = "genesis-v14";
    uint256 public constant MAX_SUPPLY = 1000;
    uint256 public constant MINT_DURATION = 24 hours;
    address public immutable controller;
    ManekinekoVotingV14 public immutable voting;
    uint48 public startsAt;
    uint48 public endsAt;
    uint256 public totalMinted;
    /// @notice A permanent primary-mint record; transfers never restore the allowance.
    /// @dev This limits wallets, not people. Secondary ownership can exceed one NFT.
    mapping(address => bool) public hasMinted;
    event MintOpened(uint48 startsAt, uint48 endsAt);
    error Unauthorized();
    error MintClosed();
    error AlreadyMinted();

    /// @param protocol The season controller that will open this mint when sealing its catalog.
    /// @param votingContract Its matching voting ledger, which records ownership snapshots.
    constructor(address protocol, address votingContract) ERC721("Tincta Genesis", "TINCTA0") {
        if (protocol.code.length == 0 || votingContract.code.length == 0 ||
            ManekinekoVotingV14(votingContract).controller() != protocol) revert Unauthorized();
        controller = protocol;
        voting = ManekinekoVotingV14(votingContract);
    }

    /// @notice Opens exactly once, atomically with catalog sealing and after voting binding.
    function open() external {
        if (msg.sender != controller || startsAt != 0 || voting.genesis() != address(this)) revert Unauthorized();
        startsAt = uint48(block.timestamp);
        endsAt = startsAt + uint48(MINT_DURATION);
        emit MintOpened(startsAt, endsAt);
    }

    /// @notice Minting includes the opening timestamp and excludes the closing timestamp.
    /// @dev An early sellout stops minting but does not shorten the controller's 24-hour wait.
    function mintOpen() public view returns (bool) {
        return startsAt != 0 && block.timestamp >= startsAt && block.timestamp < endsAt && totalMinted < MAX_SUPPLY;
    }

    /// @notice Nonpayable: zero mint price; the caller pays only network gas.
    function mint() external nonReentrant {
        if (!mintOpen()) revert MintClosed();
        if (hasMinted[msg.sender]) revert AlreadyMinted();
        // Consume the allowance before calling a receiver contract; re-entry cannot mint twice.
        hasMinted[msg.sender] = true;
        _safeMint(msg.sender, ++totalMinted);
    }

    /// @dev Every mint/transfer updates the voting ledger atomically. Moving an NFT
    /// after the snapshot cannot create a second vote or move the recorded vote.
    function _update(address to, uint256 tokenId, address auth) internal override returns (address from) {
        from = super._update(to, tokenId, auth);
        voting.recordTransfer(from, to);
    }

    /// @notice Permanent JSON and SVG stored as data URIs, generated entirely onchain.
    /// @dev The image identifies the collectible, never its owner's current voting eligibility.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory id = Strings.toString(tokenId);
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600">',
            '<rect width="600" height="600" fill="#fff"/>',
            '<g fill="none" stroke="#181818" stroke-width="1.5">',
            '<rect x="120" y="120" width="360" height="360"/>',
            '<circle cx="300" cy="300" r="180"/>',
            '<path d="M120 300h360M300 120v360"/></g>',
            '<circle cx="300" cy="300" r="12" fill="#181818"/>',
            '<g fill="#181818" font-family="sans-serif" font-size="16">',
            '<text x="40" y="58">Tincta</text><text x="560" y="58" text-anchor="end">Genesis</text>',
            '<text x="40" y="554">The first vote.</text>',
            '<text x="560" y="554" text-anchor="end">#', id, ' / 1000</text></g></svg>'
        );
        return string.concat('data:application/json;base64,', Base64.encode(bytes(string.concat(
            '{"name":"Tincta Genesis #', id,
            '","description":"Free collectible. Snapshot ownership grants voting power only for the first paid collection. No prize, affiliate, sponsored mint or season holder reward entitlement. Network gas applies.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '"}'
        ))));
    }
}
