// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.9;

contract JudgePanel {
    enum Phaze {
        INITIAL,
        COMMIT,
        REVEAL,
        FINALIZED
    }

    Phaze public phaze = Phaze.INITIAL;

    bytes32 private _proposal;

    uint256 private _votingStarted;
    uint256 private _judgeCount;
    uint256 private _medianScore;
    uint256 private _reveals;

    mapping(address => bool) private _judges;
    mapping(address => bytes32) private _scores;

    event VotingStarted(address initiator);
    event VotingEnded(uint256 score);

    modifier onlyJudge() {
        require(isJudge(msg.sender), "JP: Not a judge");
        _;
    }

    modifier onlyPhaze(Phaze _phaze) {
        require(phaze == _phaze, "JP: Wrong phase");
        _;
    }

    /// @notice             Starts the commit phaze
    /// @param  proposal    Proposal IPFS hash
    /// @param  judges      Array of addresses that are able to set scores
    function init(bytes32 proposal, address[] calldata judges) onlyPhaze(Phaze.INITIAL) public {
        _proposal = proposal;
        uint256 judgeCount = judges.length;


        for (uint256 i; i < judgeCount; ++i) {
            _judges[judges[i]] = true;
        } 

        _judgeCount = judgeCount;
        phaze = Phaze.COMMIT;
        _votingStarted = block.timestamp;

        emit VotingStarted(msg.sender);
    }

    /// @notice             Judge commits a score to be revealed later
    /// @param  scoreHash   keccak256(encodePacked(uint256 score, uin256 nullifier))
    function commitScore(bytes32 scoreHash) public onlyPhaze(Phaze.COMMIT) onlyJudge {
        _scores[msg.sender] = scoreHash;
    }

    /// @notice             Starts the reveal phaze
    function startReveal() public {
        require(block.timestamp > (_votingStarted + 5 * 60 - 1), "JP: Commit phaze timer");
        phaze = Phaze.REVEAL;
    }

    /// @notice             Judge reveals the score
    /// @param  score       The given score
    /// @param  nullifier   Random uint256 used for scoreHash
    function revealScore(uint256 score, uint256 nullifier) public onlyPhaze(Phaze.REVEAL) onlyJudge {    
        require(_scoreInRange(score) && _validScoreHash(score, nullifier), "JP: Reveal failed");

        uint256 reveals = ++_reveals;
        _medianScore = (_medianScore + score) / reveals;
    }

    /// @notice             Starts the final phaze
    function finalize() public {
        require(_judgeCount == _reveals, "JP: Not all judges revealed");
        phaze = Phaze.FINALIZED;

        emit VotingEnded(_medianScore);
    }

    /// @notice             Returns the median score
    function getMedian() onlyPhaze(Phaze.FINALIZED) public view returns (uint256) {
        return _medianScore;
    }

    /// @notice             Judge helper
    function isJudge(address _address) public view returns (bool) {
        return _judges[_address];
    }

    /// @notice             Validates if the score is the same as the commited hash
    function _validScoreHash(uint256 score, uint256 nullifier) private view returns (bool) {
        return (keccak256(abi.encodePacked(score, nullifier)) == _scores[msg.sender]);
    }

    /// @notice             Validates if the score is in range
    /// @dev                checking for score > 0 is not necessary since uint

    function _scoreInRange(uint256 score) private pure returns (bool) {
        return (score < 11);
    }
}
