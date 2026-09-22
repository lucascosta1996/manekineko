// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {MultiAwardRank} from "../libraries/MultiAwardRank.sol";
contract MultiAwardRankHarness {
    function sampleSpace(uint256 supply, uint256 count) external pure returns (uint256) { return MultiAwardRank.sampleSpace(supply, count); }
    function tryWinners(bytes32 word, uint256 supply, uint256 count) external pure returns (bool, uint256[10] memory) { return MultiAwardRank.tryWinners(word, supply, count); }
    function ranks(uint256 supply, uint256[10] memory winners, uint256 count) external pure returns (uint256[] memory result) {
        result = new uint256[](supply);
        for (uint256 id = 1; id <= supply; ++id) result[id - 1] = MultiAwardRank.rank(id, supply, winners, count);
    }
}
