// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {ScrambledRank} from "../libraries/ScrambledRank.sol";
import {UniqueRank} from "../libraries/UniqueRank.sol";

/// @dev Test-only pure access. No entropy, minting or production state.
contract ScrambledRankHarness {
    function encode(uint256 code, bytes32 key) external pure returns (uint256) { return ScrambledRank.encode(code, key); }
    function decode(uint256 code, bytes32 key) external pure returns (uint256) { return ScrambledRank.decode(code, key); }
    function numbers(uint256 code) external pure returns (uint256[4] memory) { return ScrambledRank.numbers(code); }
    function pack(uint256[4] calldata numbers_) external pure returns (uint256) { return ScrambledRank.pack(numbers_); }
    function score(uint256[4] calldata numbers_, bytes32 key, uint256 supply) external pure returns (uint256) {
        return ScrambledRank.score(numbers_, key, supply);
    }
    function permutationBatch(bytes32 key, uint256 firstCode, uint256 count)
        external pure returns (uint256[] memory encoded, uint256[] memory decoded)
    {
        require(count <= 256 && firstCode + count <= 65536, "Invalid batch");
        encoded = new uint256[](count);
        decoded = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            encoded[i] = ScrambledRank.encode(firstCode + i, key);
            decoded[i] = ScrambledRank.decode(encoded[i], key);
        }
    }
    function rankBatch(bytes32 key, uint256 supply, uint256 offset, uint256 firstId, uint256 count)
        external pure returns (uint256[] memory ranks, uint256[] memory codes, uint256[4][] memory numbers_, uint256[] memory scores)
    {
        require(count <= 100, "Invalid batch");
        ranks = new uint256[](count);
        codes = new uint256[](count);
        numbers_ = new uint256[4][](count);
        scores = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            ranks[i] = UniqueRank.rank(firstId + i, supply, offset);
            codes[i] = ScrambledRank.encode(ranks[i] - 1, key);
            numbers_[i] = ScrambledRank.numbers(codes[i]);
            scores[i] = ScrambledRank.score(numbers_[i], key, supply);
        }
    }
}
