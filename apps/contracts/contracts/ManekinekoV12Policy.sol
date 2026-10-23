// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice Fixed before any mint; neither operator nor voting can change these safeguards.
library ManekinekoV12Policy {
    uint256 internal constant RANDOMNESS_TIMEOUT = 3 days;
    uint256 internal constant EXECUTION_REWARD = 0.01 ether;
}
