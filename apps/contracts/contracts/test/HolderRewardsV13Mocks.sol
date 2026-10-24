// SPDX-License-Identifier: MIT
pragma solidity 0.8.37;
import {IERC721Receiver} from "@openzeppelin/contracts/token/ERC721/IERC721Receiver.sol";
interface IClaimHolderRewardV13 { function claim(address collection, uint256 tokenId, address payable recipient) external; }
contract HolderRewardsV13Receiver is IERC721Receiver {
    address public pool;
    address public collection;
    uint256 public token;
    bool public reject;
    bool public reentryBlocked;
    function configure(address p, address c, uint256 t, bool r) external { pool = p; collection = c; token = t; reject = r; }
    function claim() external { IClaimHolderRewardV13(pool).claim(collection, token, payable(address(this))); }
    receive() external payable {
        require(!reject, "reject");
        try IClaimHolderRewardV13(pool).claim(collection, token, payable(address(this))) { revert("reentered"); }
        catch { reentryBlocked = true; }
    }
    function onERC721Received(address, address, uint256, bytes calldata) external pure returns (bytes4) { return this.onERC721Received.selector; }
}
