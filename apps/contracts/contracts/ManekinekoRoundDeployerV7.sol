// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {ManekinekoRoundV7} from "./ManekinekoRoundV7.sol";

/// @dev Non-executable immutable creation-code storage. STOP prefix prevents data execution.
contract ManekinekoV7CodePart {
    constructor(bytes memory data) {
        bytes memory runtime = abi.encodePacked(hex"00", data);
        assembly ("memory-safe") { return(add(runtime, 32), mload(runtime)) }
    }
}

/// @notice Only the creating factory can deploy the pinned, complete round bytecode. No proxies or mutable implementations.
/// @dev Two inert code stores avoid EIP-170 for a template whose initcode exceeds the runtime-size ceiling.
contract ManekinekoRoundDeployerV7 {
    address public immutable factory;
    address public immutable codePart1;
    address public immutable codePart2;
    uint256 private immutable firstLength;
    uint256 private immutable secondLength;
    error OnlyFactory();
    error DeploymentFailed();
    constructor() {
        factory = msg.sender;
        bytes memory code = type(ManekinekoRoundV7).creationCode;
        uint256 split = code.length / 2;
        bytes memory first = new bytes(split);
        bytes memory second = new bytes(code.length - split);
        assembly ("memory-safe") {
            mcopy(add(first, 32), add(code, 32), split)
            mcopy(add(second, 32), add(add(code, 32), split), mload(second))
        }
        codePart1 = address(new ManekinekoV7CodePart(first));
        codePart2 = address(new ManekinekoV7CodePart(second));
        firstLength = first.length;
        secondLength = second.length;
    }
    function deploy(ManekinekoRoundV7.Config calldata config, address renderer) external returns (address round) {
        if (msg.sender != factory) revert OnlyFactory();
        bytes memory code = new bytes(firstLength + secondLength);
        address part1 = codePart1;
        address part2 = codePart2;
        uint256 firstSize = firstLength;
        uint256 secondSize = secondLength;
        assembly ("memory-safe") {
            extcodecopy(part1, add(code, 32), 1, firstSize)
            extcodecopy(part2, add(add(code, 32), firstSize), 1, secondSize)
        }
        bytes memory init = abi.encodePacked(code, abi.encode(config, renderer));
        assembly ("memory-safe") { round := create(0, add(init, 32), mload(init)) }
        if (round == address(0)) revert DeploymentFailed();
    }
}
