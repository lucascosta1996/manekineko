// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice Reversible display encoding of an already selected rank, never a source of entropy.
/// @dev Four fixed Feistel rounds permute every 16-bit value for every key. This changes the
///      displayed combination, not UniqueRank's rank, winner or probability distribution.
///      The small public domain is not encryption and supplies no secrecy after reveal.
library ScrambledRank {
    uint256 internal constant MAX_CODE = 65_535;

    error InvalidCode(uint256 code);
    error InvalidNumber(uint256 index, uint256 value);
    error InvalidSupply(uint256 supply);
    error InvalidRank(uint256 rank, uint256 supply);

    function encode(uint256 rankCode, bytes32 key) internal pure returns (uint256) {
        if (rankCode > MAX_CODE) revert InvalidCode(rankCode);
        uint256 left = rankCode >> 8;
        uint256 right = rankCode & 255;
        for (uint256 i; i < 4; ++i) {
            uint256 next = left ^ (uint256(keccak256(abi.encode(key, i, right))) & 255);
            left = right;
            right = next;
        }
        return (left << 8) | right;
    }

    function decode(uint256 code, bytes32 key) internal pure returns (uint256) {
        if (code > MAX_CODE) revert InvalidCode(code);
        uint256 left = code >> 8;
        uint256 right = code & 255;
        for (uint256 i = 4; i != 0;) {
            unchecked { --i; } // The loop condition proves i is positive.
            uint256 previousLeft = right ^ (uint256(keccak256(abi.encode(key, i, left))) & 255);
            right = left;
            left = previousLeft;
        }
        return (left << 8) | right;
    }

    function numbers(uint256 code) internal pure returns (uint256[4] memory) {
        if (code > MAX_CODE) revert InvalidCode(code);
        // Each extracted nibble is at most 15.
        unchecked {
            return [(code >> 12) + 1, ((code >> 8) & 15) + 1, ((code >> 4) & 15) + 1, (code & 15) + 1];
        }
    }

    function pack(uint256[4] memory combination) internal pure returns (uint256 code) {
        for (uint256 i; i < 4; ++i) {
            if (combination[i] == 0 || combination[i] > 16) revert InvalidNumber(i, combination[i]);
            unchecked { code = (code << 4) | (combination[i] - 1); } // Validated digit is 1..16.
        }
    }

    function score(uint256[4] memory combination, bytes32 key, uint256 supply) internal pure returns (uint256 result) {
        if (supply == 0 || supply > MAX_CODE + 1) revert InvalidSupply(supply);
        unchecked { result = decode(pack(combination), key) + 1; } // Decoding returns 0..65535.
        if (result > supply) revert InvalidRank(result, supply);
    }
}
