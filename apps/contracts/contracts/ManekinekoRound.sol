// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @title One finite, fully on-chain Manekineko competition.
/// @notice Minted NFTs are sealed until sellout and capture of a fixed future block hash.
/// @dev Block producers can influence that hash. This is NOT manipulation-resistant randomness.
///      No external oracle, renderer, metadata host, or upgrade administrator is required.
contract ManekinekoRound is ERC721, Ownable2Step, ReentrancyGuard {
    using Strings for uint256;

    struct Config {
        string name;
        string symbol;
        uint256 roundId;
        uint256 maxSupply;
        uint256 mintPrice;
        uint256 mintDeadline;
        uint256 revealDelayBlocks;
        address initialOwner;
    }

    enum Phase { Minting, AwaitingReveal, Settling, AwaitingPrize, Complete, Refundable }

    uint256 public constant MAX_SUPPLY = 65_536;
    uint256 public constant MAX_MINT_BATCH = 20;
    uint256 public constant MAX_SETTLEMENT_BATCH = 200;
    uint256 public constant SCORE_RADIX = 1 << 32;
    uint256 public constant PRIZE_BPS = 5_000;
    string public constant SCORE_FORMULA = "(a*b+c*d)*4294967296+combinationCode";

    uint256 public immutable roundId;
    uint256 public immutable maxSupply;
    uint256 public immutable mintPrice;
    uint256 public immutable mintDeadline;
    uint256 public immutable revealDelayBlocks;

    uint256 public totalMinted;
    uint256 public totalMintRevenue;
    uint256 public totalRefunded;
    uint256 public refundedCount;
    uint256 public revealBlock;
    bytes32 public revealSeed;
    bool public revealed;
    bool public cancelled;
    uint256 public settledCount;
    uint256 public winningTokenId;
    uint256 public highestScore;
    bool public prizePaid;
    address public prizeRecipient;
    uint256 public prizePaidAmount;

    error InvalidConfig();
    error InvalidQuantity();
    error InvalidPayment(uint256 expected, uint256 received);
    error MintClosed();
    error InvalidPhase();
    error RevealNotAvailable();
    error NotTokenHolder();
    error InvalidRecipient();
    error TransferFailed();
    error InsufficientWithdrawableBalance();
    error OwnershipRenunciationDisabled();

    event Minted(address indexed payer, address indexed recipient, uint256 indexed firstTokenId, uint256 quantity);
    event SoldOut(uint256 indexed roundId, uint256 revealBlock, uint256 mintRevenue);
    event Revealed(bytes32 indexed seed, uint256 indexed sourceBlock);
    event SettlementProgress(uint256 settledCount, uint256 winningTokenId, uint256 highestScore);
    event WinnerDetermined(uint256 indexed tokenId, uint256 score, uint256 prize);
    event PrizeDelivered(uint256 indexed tokenId, address indexed holder, uint256 amount);
    event RoundCancelled(uint256 indexed roundId);
    event Refunded(uint256 indexed tokenId, address indexed holder, address indexed recipient, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    // ERC-4906 tells indexers to refresh sealed metadata after reveal/cancellation.
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    constructor(Config memory config) ERC721(config.name, config.symbol) Ownable(config.initialOwner) {
        if (
            bytes(config.name).length == 0 || bytes(config.name).length > 80 ||
            bytes(config.symbol).length == 0 || bytes(config.symbol).length > 16 ||
            config.roundId == 0 || config.maxSupply == 0 || config.maxSupply > MAX_SUPPLY ||
            config.mintPrice < 2 || config.mintPrice % 2 != 0 ||
            config.mintPrice > type(uint256).max / config.maxSupply ||
            config.mintDeadline <= block.timestamp ||
            config.revealDelayBlocks < 2 || config.revealDelayBlocks > 200
        ) revert InvalidConfig();
        roundId = config.roundId;
        maxSupply = config.maxSupply;
        mintPrice = config.mintPrice;
        mintDeadline = config.mintDeadline;
        revealDelayBlocks = config.revealDelayBlocks;
    }

    /// @notice Pay exactly quantity * mintPrice in the chain's native currency.
    function mint(address to, uint256 quantity) external payable nonReentrant {
        if (cancelled || soldOut() || block.timestamp >= mintDeadline) revert MintClosed();
        if (to == address(0) || to == address(this)) revert InvalidRecipient();
        if (quantity == 0 || quantity > MAX_MINT_BATCH || quantity > maxSupply - totalMinted) revert InvalidQuantity();
        uint256 cost = mintPrice * quantity;
        if (msg.value != cost) revert InvalidPayment(cost, msg.value);
        uint256 firstId = totalMinted + 1;
        totalMinted += quantity;
        totalMintRevenue += cost;
        if (soldOut()) revealBlock = block.number + revealDelayBlocks;
        for (uint256 id = firstId; id < firstId + quantity; ++id) _safeMint(to, id);
        if (soldOut()) {
            emit SoldOut(roundId, revealBlock, totalMintRevenue);
        }
        emit Minted(msg.sender, to, firstId, quantity);
    }

    /// @notice Anyone can preserve the committed block hash; callers cannot select or reroll it.
    function captureReveal() external nonReentrant {
        if (!soldOut() || revealed || cancelled) revert InvalidPhase();
        if (block.number <= revealBlock || block.number > revealBlock + 256) revert RevealNotAvailable();
        bytes32 sourceHash = blockhash(revealBlock);
        if (sourceHash == bytes32(0)) revert RevealNotAvailable();
        revealSeed = keccak256(abi.encode(sourceHash, address(this), block.chainid, roundId));
        revealed = true;
        emit Revealed(revealSeed, revealBlock);
        emit BatchMetadataUpdate(1, totalMinted);
    }

    /// @notice Anyone can advance a bounded, sequential scan. All winner arithmetic is on-chain.
    function settle(uint256 count) external nonReentrant {
        if (!revealed || cancelled || settledCount == maxSupply) revert InvalidPhase();
        if (count == 0 || count > MAX_SETTLEMENT_BATCH) revert InvalidQuantity();
        uint256 end = settledCount + count;
        if (end > maxSupply) end = maxSupply;
        uint256 bestScore = highestScore;
        uint256 bestId = winningTokenId;
        for (uint256 id = settledCount + 1; id <= end; ++id) {
            uint256 result = _score(_combinationCode(id));
            if (result > bestScore) { bestScore = result; bestId = id; }
        }
        settledCount = end;
        highestScore = bestScore;
        winningTokenId = bestId;
        emit SettlementProgress(end, bestId, bestScore);
        if (end == maxSupply) emit WinnerDetermined(bestId, bestScore, prizeAmount());
    }

    /// @notice Owner sends exactly half the primary mint receipts to the CURRENT winning NFT holder.
    /// @dev A rejecting recipient reverts all changes. Its holder can transfer the NFT, then the owner retries.
    function distributePrize() external onlyOwner nonReentrant {
        if (!revealed || cancelled || settledCount != maxSupply || prizePaid) revert InvalidPhase();
        address holder = ownerOf(winningTokenId);
        uint256 amount = prizeAmount();
        prizePaid = true;
        prizeRecipient = holder;
        prizePaidAmount = amount;
        _send(payable(holder), amount);
        emit PrizeDelivered(winningTokenId, holder, amount);
    }

    /// @notice Activate refunds after an unsold sale expires or the fixed reveal hash expires.
    function cancelExpiredRound() external nonReentrant {
        if (cancelled || revealed || !refundsAvailable()) revert InvalidPhase();
        cancelled = true;
        emit RoundCancelled(roundId);
        if (totalMinted != 0) emit BatchMetadataUpdate(1, totalMinted);
    }

    /// @notice Refund rights travel with the NFT. Only its holder (not an approved operator) can redeem.
    /// @dev Burns once and sends to a holder-chosen recipient, allowing smart wallets to recover safely.
    function refund(uint256 tokenId, address payable recipient) external nonReentrant {
        if (!refundsAvailable()) revert InvalidPhase();
        if (ownerOf(tokenId) != msg.sender) revert NotTokenHolder();
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        if (!cancelled) {
            cancelled = true;
            emit RoundCancelled(roundId);
            emit BatchMetadataUpdate(1, totalMinted);
        }
        ++refundedCount;
        totalRefunded += mintPrice;
        _burn(tokenId);
        _send(recipient, mintPrice);
        emit Refunded(tokenId, msg.sender, recipient, mintPrice);
    }

    /// @notice Owner may withdraw only unreserved native currency.
    /// @dev Before prize payment, ALL receipts remain reserved for possible full refunds.
    function withdraw(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        if (recipient == address(0) || recipient == address(this)) revert InvalidRecipient();
        if (amount == 0 || amount > withdrawableBalance()) revert InsufficientWithdrawableBalance();
        _send(recipient, amount);
        emit Withdrawn(recipient, amount);
    }

    function soldOut() public view returns (bool) { return totalMinted == maxSupply; }

    function totalSupply() external view returns (uint256) { return totalMinted - refundedCount; }

    function prizeAmount() public view returns (uint256) { return totalMintRevenue / 2; }

    function readyForNextRound() external view returns (bool) { return soldOut() && prizePaid; }

    function refundsAvailable() public view returns (bool) {
        if (cancelled) return true;
        if (revealed || prizePaid) return false;
        return soldOut() ? block.number > revealBlock + 256 : block.timestamp >= mintDeadline;
    }

    function withdrawableBalance() public view returns (uint256) {
        if (prizePaid) return address(this).balance;
        if (!refundsAvailable()) return 0;
        uint256 liability = totalMintRevenue - totalRefunded;
        return address(this).balance > liability ? address(this).balance - liability : 0;
    }

    function phase() external view returns (Phase) {
        if (prizePaid) return Phase.Complete;
        if (refundsAvailable()) return Phase.Refundable;
        if (!soldOut()) return Phase.Minting;
        if (!revealed) return Phase.AwaitingReveal;
        return settledCount == maxSupply ? Phase.AwaitingPrize : Phase.Settling;
    }

    /// @return numbers Four integers in [1,256], unique as an ordered tuple within the collection.
    /// @return code The bijective 32-bit encoding used to break arithmetic ties without duplicate scores.
    /// @return result The complete result used by settle() to determine the winner.
    function combination(uint256 tokenId) public view returns (uint256[4] memory numbers, uint256 code, uint256 result) {
        _requireOwned(tokenId);
        if (!revealed) revert RevealNotAvailable();
        code = _combinationCode(tokenId);
        numbers = _numbers(code);
        result = _score(code);
    }

    /// @notice The complete SVG and JSON are calculated by this contract and returned as data URIs.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory label = refundsAvailable() ? "Refund available" : "Sealed until reveal";
        string memory scoreLine = "";
        string memory details = '"attributes":[{"trait_type":"Status","value":"Sealed"}]';
        if (revealed) {
            (uint256[4] memory n, uint256 code, uint256 result) = combination(tokenId);
            label = string.concat(n[0].toString(), " / ", n[1].toString(), " / ", n[2].toString(), " / ", n[3].toString());
            scoreLine = string.concat('<text x="48" y="380" font-size="18">SCORE ', result.toString(), '</text>');
            details = string.concat('"attributes":[', _trait("A", n[0]), ",", _trait("B", n[1]), ",", _trait("C", n[2]), ",", _trait("D", n[3]), ",", _trait("Combination code", code), ",", _trait("Score", result), "]");
        } else if (refundsAvailable()) {
            details = '"attributes":[{"trait_type":"Status","value":"Refundable"}]';
        }
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">',
            '<rect width="640" height="640" rx="32" fill="#f6f3e9"/><g fill="#173c2c" font-family="monospace">',
            '<text x="48" y="80" font-size="24">MANEKINEKO</text><text x="48" y="128" font-size="18">ROUND ', roundId.toString(),
            '</text><text x="48" y="300" font-size="24">', label,
            '</text>', scoreLine, '<text x="48" y="550" font-size="18">TOKEN #', tokenId.toString(), '</text></g></svg>'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(string.concat(
            '{"name":"', Strings.escapeJSON(name()), " #", tokenId.toString(),
            '","description":"Four numbers. One greatest result. Rules, metadata and SVG live on-chain. ',
            'Score = (a*b+c*d)*4294967296+combinationCode. Blockhash entropy can be influenced by block producers.",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '",', details, "}"
        ))));
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }

    /// @dev An owner is permanently required by distributePrize(). Ownership transfers use two steps.
    function renounceOwnership() public view override onlyOwner { revert OwnershipRenunciationDisabled(); }

    /// @dev Four Feistel rounds permute all 2^32 inputs without collisions, regardless of seed.
    function _combinationCode(uint256 tokenId) internal view returns (uint256) {
        uint256 left = (tokenId - 1) >> 16;
        uint256 right = (tokenId - 1) & 0xffff;
        for (uint256 i; i < 4; ++i) {
            uint256 next = left ^ (uint256(keccak256(abi.encode(revealSeed, i, right))) & 0xffff);
            left = right;
            right = next;
        }
        return (left << 16) | right;
    }

    function _numbers(uint256 code) internal pure returns (uint256[4] memory) {
        return [(code >> 24) + 1, ((code >> 16) & 255) + 1, ((code >> 8) & 255) + 1, (code & 255) + 1];
    }

    function _score(uint256 code) internal pure returns (uint256) {
        uint256[4] memory n = _numbers(code);
        return (n[0] * n[1] + n[2] * n[3]) * SCORE_RADIX + code;
    }

    function _trait(string memory key, uint256 value) private pure returns (string memory) {
        return string.concat('{"trait_type":"', key, '","value":', value.toString(), "}");
    }

    function _send(address payable recipient, uint256 amount) private {
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();
    }

    /// @dev Prevent accidentally trapping NFTs at this contract, including unsafe transferFrom().
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (to == address(this)) revert InvalidRecipient();
        return super._update(to, tokenId, auth);
    }
}
