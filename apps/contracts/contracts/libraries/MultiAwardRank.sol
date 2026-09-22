// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice Samples an ordered set of 1..10 distinct winners, then assigns a unique score to every token.
/// @dev This is not a full random shuffle. Accepted candidates are unbiased under the VRF/Keccak assumption.
/// The falling-factorial sample space fits within 160 bits because supply<=65536 and count<=10.
library MultiAwardRank {
    error InvalidSupply();
    error InvalidToken();

    function sampleSpace(uint256 supply, uint256 count) internal pure returns (uint256 size) {
        if (supply == 0 || supply > 65_536 || count == 0 || count > 10 || count > supply) revert InvalidSupply();
        size = 1;
        for (uint256 i; i < count; ++i) size *= supply - i;
    }
    function tryWinners(bytes32 candidate, uint256 supply, uint256 count)
        internal pure returns (bool accepted, uint256[10] memory winners)
    {
        uint256 space = sampleSpace(supply, count);
        uint256 threshold = (type(uint256).max % space + 1) % space;
        uint256 index = uint256(candidate);
        if (index < threshold) return (false, winners);
        index %= space;
        uint256[10] memory sorted;
        for (uint256 i; i < count; ++i) {
            uint256 remaining = supply - i;
            uint256 token = index % remaining + 1;
            index /= remaining;
            // Convert the selected ordinal in the remaining tokens to its actual NFT id.
            for (uint256 j; j < i; ++j) if (sorted[j] <= token) ++token;
            winners[i] = token;
            uint256 at = i;
            while (at != 0 && sorted[at - 1] > token) { sorted[at] = sorted[at - 1]; --at; }
            sorted[at] = token;
        }
        return (true, winners);
    }
    /// @notice Winners receive N,N-1,... and losers receive the remaining unique ranks in token order.
    function rank(uint256 tokenId, uint256 supply, uint256[10] memory winners, uint256 count) internal pure returns (uint256 result) {
        sampleSpace(supply, count);
        if (tokenId == 0 || tokenId > supply) revert InvalidToken();
        result = tokenId;
        for (uint256 i; i < count; ++i) {
            if (winners[i] == 0 || winners[i] > supply) revert InvalidToken();
            if (tokenId == winners[i]) return supply - i;
            if (winners[i] < tokenId) --result;
        }
    }
}
