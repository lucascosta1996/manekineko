// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ManekinekoRoundV4} from "./ManekinekoRoundV4.sol";

/// @notice A fixed creation template. Only its creating factory may deploy complete independent rounds.
/// @dev This is not a proxy: no delegatecall, mutable implementation or arbitrary creation code exists.
contract ManekinekoRoundDeployerV4 {
    address public immutable factory;
    error OnlyFactory();
    constructor() { factory = msg.sender; }
    function deploy(ManekinekoRoundV4.Config calldata config, address renderer) external returns (address) {
        if (msg.sender != factory) revert OnlyFactory();
        return address(new ManekinekoRoundV4(config, renderer));
    }
}
