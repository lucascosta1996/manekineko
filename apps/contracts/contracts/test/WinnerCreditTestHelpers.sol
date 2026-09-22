// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";

interface ISettledHolder {
    function winningHolder() external view returns (address);
}

/// @dev Test wallet can reject receipt, observe settlement ordering and attempt cross-function reentrancy.
contract WinnerCreditReceiver is IERC721Receiver {
    bool public rejectNFT;
    bool public rejectETH;
    address public attackTarget;
    bytes public attackData;
    bool public attackSucceeded;
    bytes public attackResult;
    uint256 public attackCount;
    address public observeRound;
    address public observedWinningHolder;

    function configure(bool nftRejected, bool ethRejected, address target, bytes calldata data, address round) external {
        rejectNFT = nftRejected;
        rejectETH = ethRejected;
        attackTarget = target;
        attackData = data;
        observeRound = round;
    }

    function execute(address target, bytes calldata data) external payable returns (bytes memory result) {
        bool success;
        (success, result) = target.call{value: msg.value}(data);
        if (!success) assembly ("memory-safe") { revert(add(result, 32), mload(result)) }
    }

    function onERC721Received(address, address, uint256, bytes calldata) external returns (bytes4) {
        require(!rejectNFT, "NFT rejected");
        _attempt();
        return IERC721Receiver.onERC721Received.selector;
    }

    receive() external payable {
        require(!rejectETH, "ETH rejected");
        if (observeRound != address(0)) observedWinningHolder = ISettledHolder(observeRound).winningHolder();
        _attempt();
    }

    function _attempt() private {
        if (attackTarget == address(0)) return;
        ++attackCount;
        (attackSucceeded, attackResult) = attackTarget.call(attackData);
    }
}

/// @dev Deliberately mutable mapping to demonstrate that every use rechecks the registered binding.
contract MutableWinnerCreditFactory {
    mapping(uint256 => address) public rounds;
    function setRound(uint256 id, address round) external { rounds[id] = round; }
}

/// @notice Test-only prior-registry redemption state for migration behavior.
contract PriorWinnerCreditRegistryMock {
    mapping(address => address) public redeemedSource;
    uint256 public totalSponsorBalance;
    function markRedeemed(address holder, address source) external { redeemedSource[holder] = source; }
    function setSponsorBalance(uint256 value) external { totalSponsorBalance = value; }
}
