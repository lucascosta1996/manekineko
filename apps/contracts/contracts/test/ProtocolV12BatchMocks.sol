// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @dev Local code injection exercises the otherwise cryptographically remote rejection branch.
contract RejectingDrawRendererV12 {
    function drawWinners(bytes32, uint256, uint256) external pure returns (bool, uint256[10] memory winners) {
        return (false, winners);
    }
}
