// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice Maps an already selected offset to one unique rank per ticket.
/// @dev Pure arithmetic used by ManekinekoRoundV2; the consuming round authenticates the entropy.
///      Exact uniformity of accepted offsets is conditional on a uniformly random candidate word.
///      Integration must fix and authenticate that word without caller/owner selection or rerolls.
///      A rotation gives uniform individual winning chances under that assumption, but is not a
///      random shuffle: all ranks are correlated and one revealed rank discloses the rotation.
library UniqueRank {
    uint256 internal constant MAX_SUPPLY = 65_536;

    error InvalidSupply(uint256 supply);
    error InvalidTokenId(uint256 tokenId, uint256 supply);
    error InvalidOffset(uint256 offset, uint256 supply);
    error InvalidNumber(uint256 index, uint256 value);

    /// @notice Removes modulo bias by rejecting the short incomplete residue interval.
    /// @dev The threshold is 2**256 % supply without overflowing a uint256.
    ///      There is deliberately no retry, fallback, rehash, or entropy selection here.
    ///      Rejection must be handled by an independently reviewed integration policy.
    function tryOffset(bytes32 candidate, uint256 supply)
        internal pure returns (bool accepted, uint256 offset)
    {
        _validateSupply(supply);
        uint256 threshold = (type(uint256).max % supply + 1) % supply;
        uint256 word = uint256(candidate);
        if (word < threshold) return (false, 0);
        return (true, word % supply);
    }

    /// @notice Maps token IDs 1..supply bijectively onto ranks 1..supply.
    function rank(uint256 tokenId, uint256 supply, uint256 offset) internal pure returns (uint256) {
        _validateSupplyAndOffset(supply, offset);
        if (tokenId == 0 || tokenId > supply) revert InvalidTokenId(tokenId, supply);
        return 1 + ((tokenId - 1 + offset) % supply);
    }

    /// @notice Returns the sole token whose rank equals the collection supply.
    function winningTokenId(uint256 supply, uint256 offset) internal pure returns (uint256) {
        _validateSupplyAndOffset(supply, offset);
        return supply - offset;
    }

    /// @notice Encodes rank - 1 as four big-endian base-16 digits, each displayed as 1..16.
    function combination(uint256 tokenId, uint256 supply, uint256 offset)
        internal pure returns (uint8[4] memory numbers)
    {
        uint256 code = rank(tokenId, supply, offset) - 1;
        numbers[0] = uint8((code >> 12) & 15) + 1;
        numbers[1] = uint8((code >> 8) & 15) + 1;
        numbers[2] = uint8((code >> 4) & 15) + 1;
        numbers[3] = uint8(code & 15) + 1;
    }

    /// @notice Reconstructs the exact rank from its four displayed numbers.
    function score(uint8[4] memory numbers) internal pure returns (uint256) {
        for (uint256 i; i < 4; ++i) {
            if (numbers[i] == 0 || numbers[i] > 16) revert InvalidNumber(i, numbers[i]);
        }
        return 1 + (uint256(numbers[0]) - 1) * 4096 + (uint256(numbers[1]) - 1) * 256
            + (uint256(numbers[2]) - 1) * 16 + (uint256(numbers[3]) - 1);
    }

    function _validateSupplyAndOffset(uint256 supply, uint256 offset) private pure {
        _validateSupply(supply);
        if (offset >= supply) revert InvalidOffset(offset, supply);
    }

    function _validateSupply(uint256 supply) private pure {
        if (supply == 0 || supply > MAX_SUPPLY) revert InvalidSupply(supply);
    }
}
