// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;

import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Immutable, storage-free SVG and metadata rendering. No owner, external assets or upgrade path.
contract ManekinekoRendererV5 {
    using Strings for uint256;

    function tokenURI(string calldata collectionName, uint256 roundId, uint256 tokenId, bool refundable, bool revealed, uint256[4] calldata n, uint256 result)
        external pure returns (string memory)
    {
        string memory label = refundable ? "Refund available" : "Sealed until VRF reveal";
        string memory scoreLine = "";
        string memory details = '"attributes":[{"trait_type":"Status","value":"Sealed"}]';
        if (revealed) {
            label = string.concat(n[0].toString(), " / ", n[1].toString(), " / ", n[2].toString(), " / ", n[3].toString());
            scoreLine = string.concat('<text x="48" y="380" font-size="18">SCORE ', result.toString(), '</text>');
            details = string.concat('"attributes":[', _trait("A", n[0]), ",", _trait("B", n[1]), ",", _trait("C", n[2]), ",", _trait("D", n[3]), ",", _trait("Combination code", result - 1), ",", _trait("Score", result), "]");
        } else if (refundable) {
            details = '"attributes":[{"trait_type":"Status","value":"Refundable"}]';
        }
        string memory svg = string.concat(
            '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640">',
            '<rect width="640" height="640" rx="32" fill="#f6f3e9"/><g fill="#173c2c" font-family="monospace">',
            '<text x="48" y="80" font-size="24">MANEKINEKO</text><text x="48" y="128" font-size="18">ROUND ', roundId.toString(),
            '</text><text x="48" y="300" font-size="24">', label, '</text>', scoreLine,
            '<text x="48" y="550" font-size="18">TOKEN #', tokenId.toString(), '</text></g></svg>'
        );
        return string.concat("data:application/json;base64,", Base64.encode(bytes(string.concat(
            '{"name":"', Strings.escapeJSON(collectionName), " #", tokenId.toString(),
            '","description":"Unique ranks from 1 to collection supply. One highest score. Chainlink VRF proof verified on Ethereum. ',
            'Score = 1+(a-1)*4096+(b-1)*256+(c-1)*16+(d-1). Transfers lock from sellout until prize payment.",',
            '"contract_version":"affiliate-v5","algorithm_version":"unique-rank-v2","randomness_provider":"chainlink-vrf-v2.5",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '",', details, "}"
        ))));
    }

    function _trait(string memory key, uint256 value) private pure returns (string memory) {
        return string.concat('{"trait_type":"', key, '","value":', value.toString(), "}");
    }
}
