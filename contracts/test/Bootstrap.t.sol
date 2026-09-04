// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";

contract BootstrapTest is Test {
    function testPinnedDependenciesCompile() public pure {
        assertEq(Strings.toString(42), "42");
    }
}
