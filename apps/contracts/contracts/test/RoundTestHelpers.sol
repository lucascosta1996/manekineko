// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface IRoundCallbackState {
    function revealBlock() external view returns (uint256);
    function refundsAvailable() external view returns (bool);
    function phase() external view returns (uint8);
    function tokenURI(uint256 tokenId) external view returns (string memory);
}

/// @dev Test-only wallet exercising rejecting recipients and cross-function callbacks.
contract RoundReceiver is IERC721Receiver {
    address public immutable targetRound;
    bool public rejectNative;
    bool public attackOnMint;
    bytes public attackData;
    uint256 public attackValue;
    uint256 public callbackAttempts;
    bool public callbackSucceeded;
    bytes public callbackResult;
    uint256 public observedRevealBlock;
    bool public observedRefundsAvailable;
    uint8 public observedPhase;
    string public observedTokenURI;

    constructor(address target_) payable { targetRound = target_; }

    function configure(bool reject, bool onMint, bytes calldata data, uint256 value) external {
        rejectNative = reject;
        attackOnMint = onMint;
        attackData = data;
        attackValue = value;
    }

    function execute(bytes calldata data) external payable returns (bytes memory result) {
        bool success;
        (success, result) = targetRound.call{value: msg.value}(data);
        if (!success) assembly ("memory-safe") { revert(add(result, 32), mload(result)) }
    }

    function onERC721Received(address, address, uint256 tokenId, bytes calldata) external returns (bytes4) {
        IRoundCallbackState round = IRoundCallbackState(targetRound);
        observedRevealBlock = round.revealBlock();
        observedRefundsAvailable = round.refundsAvailable();
        observedPhase = round.phase();
        observedTokenURI = round.tokenURI(tokenId);
        if (attackOnMint) _attempt();
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {
        require(!rejectNative, "Native transfer rejected");
        if (!attackOnMint) _attempt();
    }

    function _attempt() private {
        if (attackData.length == 0) return;
        ++callbackAttempts;
        (callbackSucceeded, callbackResult) = targetRound.call{value: attackValue}(attackData);
    }
}

/// @dev Native currency can be forced into a round without minting or calling receive().
contract ForceEther {
    constructor() payable {}
    function force(address payable target) external { selfdestruct(target); }
}
