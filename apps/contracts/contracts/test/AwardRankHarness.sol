// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {AwardRank} from "../libraries/AwardRank.sol";
contract AwardRankHarness {
    function tryWinners(bytes32 candidate, uint256 supply, uint256 awards) external pure returns (bool, uint256, uint256) {
        return AwardRank.tryWinners(candidate, supply, awards);
    }
    function ranks(uint256 supply, uint256 first, uint256 second) external pure returns (uint256[] memory result) {
        result = new uint256[](supply);
        for (uint256 id = 1; id <= supply; ++id) result[id - 1] = AwardRank.rank(id, supply, first, second);
    }
}
