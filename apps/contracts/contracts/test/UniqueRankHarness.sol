// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {UniqueRank} from "../libraries/UniqueRank.sol";

/// @dev Test-only access to the isolated candidate. Never an entropy or collection contract.
contract UniqueRankHarness {
    function tryOffset(bytes32 candidate, uint256 supply) external pure returns (bool, uint256) {
        return UniqueRank.tryOffset(candidate, supply);
    }

    function rank(uint256 tokenId, uint256 supply, uint256 offset) external pure returns (uint256) {
        return UniqueRank.rank(tokenId, supply, offset);
    }

    function winningTokenId(uint256 supply, uint256 offset) external pure returns (uint256) {
        return UniqueRank.winningTokenId(supply, offset);
    }

    function combination(uint256 tokenId, uint256 supply, uint256 offset)
        external pure returns (uint8[4] memory)
    {
        return UniqueRank.combination(tokenId, supply, offset);
    }

    function score(uint8[4] memory numbers) external pure returns (uint256) {
        return UniqueRank.score(numbers);
    }

    function rankBatch(uint256 supply, uint256 offset, uint256 firstTokenId, uint256 count)
        external pure returns (uint256[] memory ranks, uint8[4][] memory numbers, uint256[] memory scores)
    {
        ranks = new uint256[](count);
        numbers = new uint8[4][](count);
        scores = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            uint256 tokenId = firstTokenId + i;
            ranks[i] = UniqueRank.rank(tokenId, supply, offset);
            numbers[i] = UniqueRank.combination(tokenId, supply, offset);
            scores[i] = UniqueRank.score(numbers[i]);
        }
    }

    function winnerBatch(uint256 supply, uint256 firstOffset, uint256 count)
        external pure returns (uint256[] memory tokenIds, uint256[] memory ranks)
    {
        tokenIds = new uint256[](count);
        ranks = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            uint256 offset = firstOffset + i;
            tokenIds[i] = UniqueRank.winningTokenId(supply, offset);
            ranks[i] = UniqueRank.rank(tokenIds[i], supply, offset);
        }
    }
}
