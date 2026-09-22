// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {UniqueRank} from "./libraries/UniqueRank.sol";
import {IVRFCoordinatorV2Plus} from "./vendor/chainlink-vrf-v2.5/src/v0.8/vrf/dev/interfaces/IVRFCoordinatorV2Plus.sol";
import {VRFV2PlusClient} from "./vendor/chainlink-vrf-v2.5/src/v0.8/vrf/dev/libraries/VRFV2PlusClient.sol";

/// @title A finite Ethereum NFT competition with one immutable VRF request and one winner.
/// @notice Artwork and scoring are on-chain; Chainlink generates randomness and verifies its proof on-chain.
/// @dev Coordinator authentication is implemented here rather than inheriting the upstream consumer's
///      mutable coordinator/ownership API. Neither owner nor coordinator can replace this round's verifier.
contract ManekinekoRoundV2 is ERC721, Ownable2Step, ReentrancyGuard {
    using Strings for uint256;

    struct Config {
        string name;
        string symbol;
        uint256 roundId;
        uint256 maxSupply;
        uint256 mintPrice;
        uint256 mintDeadline;
        address initialOwner;
        address vrfCoordinator;
        bytes32 keyHash;
        uint16 requestConfirmations;
        uint32 callbackGasLimit;
    }

    enum Phase { PendingActivation, Minting, AwaitingRequest, AwaitingRandomness, AwaitingFinalization, AwaitingPrize, Complete, Refundable }

    uint256 public constant MAX_SUPPLY = 65_536;
    uint256 public constant MAX_MINT_BATCH = 20;
    uint256 public constant MAX_DRAW_ATTEMPTS = 8;
    uint256 public constant PRIZE_BPS = 5_000;
    uint256 public constant PRIZE_CLAIM_DELAY = 7 days;
    string public constant ALGORITHM_VERSION = "unique-rank-v2";
    string public constant RANDOMNESS_PROVIDER = "chainlink-vrf-v2.5";
    string public constant SCORE_FORMULA = "1+(a-1)*4096+(b-1)*256+(c-1)*16+(d-1)";
    bytes32 public constant DRAW_DOMAIN = keccak256("MANEKINEKO_UNIQUE_RANK_V2");

    uint256 public immutable roundId;
    uint256 public immutable maxSupply;
    uint256 public immutable mintPrice;
    uint256 public immutable mintDeadline;
    IVRFCoordinatorV2Plus public immutable vrfCoordinator;
    bytes32 public immutable keyHash;
    uint256 public immutable subscriptionId;
    uint16 public immutable requestConfirmations;
    uint32 public immutable callbackGasLimit;

    bool public saleActivated;
    uint256 public totalMinted;
    uint256 public totalMintRevenue;
    uint256 public totalRefunded;
    uint256 public refundedCount;
    bool public cancelled;
    bool public randomnessRequested;
    uint256 public requestId;
    bool public randomnessReceived;
    uint256 public randomWord;
    uint256 public drawCounter;
    bool public revealed;
    uint256 public drawOffset;
    uint256 public finalizedAt;
    uint256 public winningTokenId;
    uint256 public highestScore;
    bool public prizePaid;
    address public prizeRecipient;
    uint256 public prizePaidAmount;
    bool public subscriptionClosed;

    error InvalidConfig();
    error UnsupportedChain();
    error InvalidQuantity();
    error InvalidPayment(uint256 expected, uint256 received);
    error MintClosed();
    error InvalidPhase();
    error InvalidFunding();
    error SubscriptionNotReady();
    error OnlyCoordinator();
    error InvalidFulfillment();
    error RevealNotAvailable();
    error NotTokenHolder();
    error ClaimNotAvailable();
    error TransfersLocked();
    error InvalidRecipient();
    error TransferFailed();
    error InsufficientWithdrawableBalance();
    error OwnershipRenunciationDisabled();

    event SubscriptionPrepared(uint256 indexed subscriptionId, address indexed coordinator);
    event RandomnessFunded(address indexed payer, uint256 amount);
    event SaleActivated(uint256 indexed roundId);
    event Minted(address indexed payer, address indexed recipient, uint256 indexed firstTokenId, uint256 quantity);
    event SoldOut(uint256 indexed roundId, uint256 mintRevenue);
    event RandomnessRequested(uint256 indexed requestId, uint256 indexed subscriptionId);
    event RandomnessReceived(uint256 indexed requestId, uint256 word);
    event DrawProgress(uint256 nextCounter);
    event WinnerDetermined(uint256 indexed tokenId, uint256 score, uint256 prize);
    event PrizeDelivered(uint256 indexed tokenId, address indexed holder, address indexed recipient, uint256 amount);
    event RoundCancelled(uint256 indexed roundId);
    event Refunded(uint256 indexed tokenId, address indexed holder, address indexed recipient, uint256 amount);
    event Withdrawn(address indexed recipient, uint256 amount);
    event RandomnessFundingWithdrawn(address indexed recipient);
    event BatchMetadataUpdate(uint256 _fromTokenId, uint256 _toTokenId);

    constructor(Config memory config) ERC721(config.name, config.symbol) Ownable(config.initialOwner) {
        if (
            bytes(config.name).length == 0 || bytes(config.name).length > 80 ||
            bytes(config.symbol).length == 0 || bytes(config.symbol).length > 16 ||
            config.roundId == 0 || config.maxSupply == 0 || config.maxSupply > MAX_SUPPLY ||
            config.mintPrice < 2 || config.mintPrice % 2 != 0 ||
            config.mintPrice > type(uint256).max / config.maxSupply ||
            config.mintDeadline <= block.timestamp || config.vrfCoordinator.code.length == 0 ||
            config.keyHash == bytes32(0) || config.requestConfirmations < 64 || config.requestConfirmations > 200 ||
            config.callbackGasLimit < 100_000 || config.callbackGasLimit > 2_500_000
        ) revert InvalidConfig();
        // Reviewed Ethereum networks only; local simulated-chain mocks never pass this check on Mainnet.
        if (block.chainid == 1) {
            if (config.vrfCoordinator != 0xD7f86b4b8Cae7D942340FF628F82735b7a20893a ||
                config.keyHash != 0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9) revert InvalidConfig();
        } else if (block.chainid == 11155111) {
            if (config.vrfCoordinator != 0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B ||
                config.keyHash != 0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae) revert InvalidConfig();
        } else if (block.chainid != 31337) revert UnsupportedChain();
        roundId = config.roundId;
        maxSupply = config.maxSupply;
        mintPrice = config.mintPrice;
        mintDeadline = config.mintDeadline;
        vrfCoordinator = IVRFCoordinatorV2Plus(config.vrfCoordinator);
        keyHash = config.keyHash;
        requestConfirmations = config.requestConfirmations;
        callbackGasLimit = config.callbackGasLimit;
        // The round owns its subscription; no external subscription owner can remove this consumer.
        uint256 id = vrfCoordinator.createSubscription();
        subscriptionId = id;
        vrfCoordinator.addConsumer(id, address(this));
        emit SubscriptionPrepared(id, config.vrfCoordinator);
    }

    /// @notice Anyone can fund the VRF subscription separately from ticket/prize funds.
    function fundRandomness() external payable nonReentrant {
        if (msg.value == 0 || subscriptionClosed || randomnessReceived || refundsAvailable()) revert InvalidFunding();
        vrfCoordinator.fundSubscriptionWithNative{value: msg.value}(subscriptionId);
        emit RandomnessFunded(msg.sender, msg.value);
    }

    /// @notice One-way activation after initial VRF funding. Funding still needs monitoring as fees vary.
    function activateSale() external onlyOwner nonReentrant {
        if (saleActivated || refundsAvailable()) revert InvalidPhase();
        (, uint96 nativeBalance, , address subscriptionOwner, address[] memory consumers) = vrfCoordinator.getSubscription(subscriptionId);
        if (nativeBalance == 0 || subscriptionOwner != address(this) || consumers.length != 1 || consumers[0] != address(this)) revert SubscriptionNotReady();
        saleActivated = true;
        emit SaleActivated(roundId);
    }

    function mint(address to, uint256 quantity) external payable nonReentrant {
        if (!saleActivated || cancelled || soldOut() || block.timestamp >= mintDeadline) revert MintClosed();
        _validateRecipient(to);
        if (quantity == 0 || quantity > MAX_MINT_BATCH || quantity > maxSupply - totalMinted) revert InvalidQuantity();
        uint256 cost = mintPrice * quantity;
        if (msg.value != cost) revert InvalidPayment(cost, msg.value);
        uint256 firstId = totalMinted + 1;
        totalMinted += quantity;
        totalMintRevenue += cost;
        for (uint256 id = firstId; id < firstId + quantity; ++id) _safeMint(to, id);
        if (soldOut()) emit SoldOut(roundId, totalMintRevenue);
        emit Minted(msg.sender, to, firstId, quantity);
    }

    /// @notice Permissionless single request after sales are irrevocably closed.
    /// @dev A reverted request creates no on-chain request; retrying that failure is safe.
    function requestRandomness() external nonReentrant returns (uint256 id) {
        if (!soldOut() || cancelled || randomnessRequested) revert InvalidPhase();
        randomnessRequested = true;
        id = vrfCoordinator.requestRandomWords(VRFV2PlusClient.RandomWordsRequest({
            keyHash: keyHash,
            subId: subscriptionId,
            requestConfirmations: requestConfirmations,
            callbackGasLimit: callbackGasLimit,
            numWords: 1,
            extraArgs: VRFV2PlusClient._argsToBytes(VRFV2PlusClient.ExtraArgsV1({nativePayment: true}))
        }));
        requestId = id;
        emit RandomnessRequested(id, subscriptionId);
    }

    /// @dev Called only by the immutable proof-verifying coordinator. Valid fulfillment has no external calls,
    ///      arithmetic sampling, NFT iteration, or payment. Zero is a valid random word.
    function rawFulfillRandomWords(uint256 id, uint256[] calldata words) external nonReentrant {
        if (msg.sender != address(vrfCoordinator)) revert OnlyCoordinator();
        if (!randomnessRequested || id != requestId || randomnessReceived || words.length != 1) revert InvalidFulfillment();
        randomWord = words[0];
        randomnessReceived = true;
        emit RandomnessReceived(id, words[0]);
    }

    /// @notice Finish the unique ranking with bounded deterministic work; every caller follows the same stream.
    /// @dev Keccak expansion uses a cryptographic assumption, not new independent information-theoretic entropy.
    function finalizeDraw(uint256 attempts) external nonReentrant {
        if (!randomnessReceived || revealed) revert InvalidPhase();
        if (attempts == 0 || attempts > MAX_DRAW_ATTEMPTS) revert InvalidQuantity();
        uint256 counter = drawCounter;
        for (uint256 i; i < attempts; ++i) {
            bytes32 candidate = keccak256(abi.encode(DRAW_DOMAIN, randomWord, block.chainid, address(this), roundId, maxSupply, counter));
            (bool accepted, uint256 offset) = UniqueRank.tryOffset(candidate, maxSupply);
            ++counter;
            if (accepted) {
                drawCounter = counter;
                drawOffset = offset;
                winningTokenId = UniqueRank.winningTokenId(maxSupply, offset);
                highestScore = maxSupply;
                finalizedAt = block.timestamp;
                revealed = true;
                emit WinnerDetermined(winningTokenId, highestScore, prizeAmount());
                emit BatchMetadataUpdate(1, totalMinted);
                return;
            }
        }
        drawCounter = counter;
        emit DrawProgress(counter);
    }

    /// @notice Owner pays exactly half the primary receipts to the winning NFT holder.
    function distributePrize() external onlyOwner nonReentrant {
        if (!revealed || prizePaid) revert InvalidPhase();
        address holder = ownerOf(winningTokenId);
        _payPrize(holder, payable(holder));
    }

    /// @notice After a fixed seven-day grace period, the winning holder can recover without the owner.
    /// @dev A holder-chosen recipient supports wallets that reject direct native-currency payments.
    function claimPrize(address payable recipient) external nonReentrant {
        if (!revealed || prizePaid) revert InvalidPhase();
        if (block.timestamp < finalizedAt + PRIZE_CLAIM_DELAY) revert ClaimNotAvailable();
        address holder = ownerOf(winningTokenId);
        if (msg.sender != holder) revert NotTokenHolder();
        _validateRecipient(recipient);
        _payPrize(holder, recipient);
    }

    function cancelExpiredRound() external nonReentrant {
        if (cancelled || !refundsAvailable()) revert InvalidPhase();
        cancelled = true;
        emit RoundCancelled(roundId);
        if (totalMinted != 0) emit BatchMetadataUpdate(1, totalMinted);
    }

    /// @notice Unsold rounds refund the current token holder. Sold-out rounds cannot discard a draw.
    function refund(uint256 tokenId, address payable recipient) external nonReentrant {
        if (!refundsAvailable()) revert InvalidPhase();
        if (ownerOf(tokenId) != msg.sender) revert NotTokenHolder();
        _validateRecipient(recipient);
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

    function withdraw(address payable recipient, uint256 amount) external onlyOwner nonReentrant {
        _validateRecipient(recipient);
        if (amount == 0 || amount > withdrawableBalance()) revert InsufficientWithdrawableBalance();
        _send(recipient, amount);
        emit Withdrawn(recipient, amount);
    }

    /// @notice Recover only the separate unused VRF budget after entropy is received or an unsold sale expires.
    function withdrawRandomnessFunding(address payable recipient) external onlyOwner nonReentrant {
        _validateRecipient(recipient);
        if (subscriptionClosed || (!randomnessReceived && !refundsAvailable())) revert InvalidPhase();
        subscriptionClosed = true;
        vrfCoordinator.cancelSubscription(subscriptionId, recipient);
        emit RandomnessFundingWithdrawn(recipient);
    }

    function soldOut() public view returns (bool) { return totalMinted == maxSupply; }
    function totalSupply() external view returns (uint256) { return totalMinted - refundedCount; }
    function prizeAmount() public view returns (uint256) { return totalMintRevenue / 2; }
    function readyForNextRound() external view returns (bool) { return soldOut() && prizePaid; }
    function refundsAvailable() public view returns (bool) {
        return cancelled || (!soldOut() && block.timestamp >= mintDeadline);
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
        if (!saleActivated) return Phase.PendingActivation;
        if (!soldOut()) return Phase.Minting;
        if (!randomnessRequested) return Phase.AwaitingRequest;
        if (!randomnessReceived) return Phase.AwaitingRandomness;
        return revealed ? Phase.AwaitingPrize : Phase.AwaitingFinalization;
    }

    function combination(uint256 tokenId) public view returns (uint256[4] memory numbers, uint256 code, uint256 result) {
        _requireOwned(tokenId);
        if (!revealed) revert RevealNotAvailable();
        uint8[4] memory digits = UniqueRank.combination(tokenId, maxSupply, drawOffset);
        for (uint256 i; i < 4; ++i) numbers[i] = digits[i];
        result = UniqueRank.score(digits);
        code = result - 1;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        string memory label = refundsAvailable() ? "Refund available" : "Sealed until VRF reveal";
        string memory scoreLine = "";
        string memory details = '"attributes":[{"trait_type":"Status","value":"Sealed"}]';
        if (revealed) {
            (uint256[4] memory n, , uint256 result) = combination(tokenId);
            label = string.concat(n[0].toString(), " / ", n[1].toString(), " / ", n[2].toString(), " / ", n[3].toString());
            scoreLine = string.concat('<text x="48" y="380" font-size="18">SCORE ', result.toString(), '</text>');
            details = string.concat('"attributes":[', _trait("A", n[0]), ",", _trait("B", n[1]), ",", _trait("C", n[2]), ",", _trait("D", n[3]), ",", _trait("Combination code", result - 1), ",", _trait("Score", result), "]");
        } else if (refundsAvailable()) {
            details = '"attributes":[{"trait_type":"Status","value":"Refundable"}]';
        }
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">',
            '<rect width="640" height="640" rx="32" fill="#f6f3e9"/><g fill="#173c2c" font-family="monospace">',
            '<text x="48" y="80" font-size="24">MANEKINEKO</text><text x="48" y="128" font-size="18">ROUND ', roundId.toString(),
            '</text><text x="48" y="300" font-size="24">', label, '</text>', scoreLine,
            '<text x="48" y="550" font-size="18">TOKEN #', tokenId.toString(), '</text></g></svg>'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(string.concat(
            '{"name":"', Strings.escapeJSON(name()), " #", tokenId.toString(),
            '","description":"Unique ranks from 1 to collection supply. One highest score. Chainlink VRF proof verified on Ethereum. ',
            'Score = 1+(a-1)*4096+(b-1)*256+(c-1)*16+(d-1). Transfers lock from sellout until prize payment.",',
            '"algorithm_version":"unique-rank-v2","randomness_provider":"chainlink-vrf-v2.5",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '",', details, "}"
        ))));
    }

    function supportsInterface(bytes4 interfaceId) public view override returns (bool) {
        return interfaceId == bytes4(0x49064906) || super.supportsInterface(interfaceId);
    }
    function renounceOwnership() public view override onlyOwner { revert OwnershipRenunciationDisabled(); }
    function _trait(string memory key, uint256 value) private pure returns (string memory) {
        return string.concat('{"trait_type":"', key, '","value":', value.toString(), "}");
    }
    function _validateRecipient(address recipient) private view {
        if (recipient == address(0) || recipient == address(this) || recipient == address(vrfCoordinator)) revert InvalidRecipient();
    }
    function _payPrize(address holder, address payable recipient) private {
        uint256 amount = prizeAmount();
        prizePaid = true;
        prizeRecipient = recipient;
        prizePaidAmount = amount;
        _send(recipient, amount);
        emit PrizeDelivered(winningTokenId, holder, recipient, amount);
    }
    function _send(address payable recipient, uint256 amount) private {
        (bool success, ) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed();
    }
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        if (to == address(this) || to == address(vrfCoordinator)) revert InvalidRecipient();
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0) && soldOut() && !prizePaid) revert TransfersLocked();
        return super._update(to, tokenId, auth);
    }
}
