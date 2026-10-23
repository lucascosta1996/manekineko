// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice Disposable Sepolia rehearsal funding. Never a production protocol dependency.
contract V12RehearsalFunding {
    constructor() { require(block.chainid == 11155111, "Sepolia only"); }
    function fund(address payable[] calldata recipients, uint256[] calldata amounts) external payable {
        require(recipients.length == amounts.length && recipients.length > 0 && recipients.length <= 100, "Invalid batch");
        uint256 total;
        for (uint256 i; i < amounts.length; ++i) total += amounts[i];
        require(total == msg.value, "Exact funding required");
        for (uint256 i; i < recipients.length; ++i) {
            require(recipients[i] != address(0), "Invalid recipient");
            (bool ok,) = recipients[i].call{value: amounts[i]}("");
            require(ok, "Transfer failed");
        }
    }
}
