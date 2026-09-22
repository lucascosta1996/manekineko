// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

/// @notice Uniform one/two-winner selection without replacement plus a bijection onto ranks 1..N.
/// @dev Accepted candidate words are uniform under the VRF/Keccak assumption. This is not a full random shuffle.
/// Every ordered pair occurs exactly once in the N*(N-1) sample space; no adjacent-ticket correlation.
library AwardRank {
    error InvalidSupply();
    error InvalidToken();
    function tryWinners(bytes32 candidate, uint256 supply, uint256 awards)
        internal pure returns (bool accepted, uint256 first, uint256 second)
    {
        if (supply == 0 || supply > 65_536 || awards == 0 || awards > 2 || awards > supply) revert InvalidSupply();
        uint256 space = awards == 1 ? supply : supply * (supply - 1);
        uint256 threshold = (type(uint256).max % space + 1) % space;
        uint256 word = uint256(candidate);
        if (word < threshold) return (false, 0, 0);
        uint256 index = word % space;
        if (awards == 1) return (true, index + 1, 0);
        first = index / (supply - 1) + 1;
        second = index % (supply - 1) + 1;
        if (second >= first) ++second;
        return (true, first, second);
    }
    function rank(uint256 tokenId, uint256 supply, uint256 first, uint256 second) internal pure returns (uint256 result) {
        if (tokenId == 0 || tokenId > supply || first == 0 || first > supply || second > supply || first == second) revert InvalidToken();
        // Rotate the first winner to the maximum, then swap the independently drawn second winner into N-1.
        result = 1 + ((tokenId - 1 + supply - first) % supply);
        if (second == 0) return result;
        uint256 secondCurrent = 1 + ((second - 1 + supply - first) % supply);
        if (result == secondCurrent) return supply - 1;
        if (result == supply - 1) return secondCurrent;
    }
}
