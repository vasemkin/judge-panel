import {
    time,
    loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers"
import { expect } from "chai"
import { encodeBytes32String } from "ethers"
import { ethers } from "hardhat"

const FIVE_MINUTES = 60 * 5
const ERRORS = {
    onlyOneVote: "JP: Only one vote",
    wrongPhase: "JP: Wrong phase",
    notJudge: "JP: Not a judge",
    notAllJudges: "JP: Not all judges revealed",
}

const scoreHash = (score: bigint, nullifier: bigint) =>
    ethers.keccak256(
        ethers.solidityPacked(["uint256", "uint256"], [score, nullifier]),
    )

describe("JudgePanel", function () {
    async function deployJudgePanel() {
        const [owner, otherAccount, thirdAccount] = await ethers.getSigners()

        const JudgePanel = await ethers.getContractFactory("JudgePanel")
        const judgePanel = await JudgePanel.deploy()

        return { judgePanel, owner, otherAccount, thirdAccount }
    }

    describe("Core logic", function () {
        it("Judges can be set", async function () {
            const { judgePanel, owner, otherAccount } = await loadFixture(
                deployJudgePanel,
            )

            await judgePanel.init(
                encodeBytes32String("my proposal"),
                [owner, otherAccount],
                BigInt(FIVE_MINUTES),
            )

            const ownerIsAJudge = await judgePanel.isJudge(owner)
            const otherIsAJudge = await judgePanel.isJudge(otherAccount)

            expect(ownerIsAJudge).to.eq(true)
            expect(otherIsAJudge).to.eq(true)
        })

        it("Commitments work", async function () {
            const { judgePanel, owner, otherAccount } = await loadFixture(
                deployJudgePanel,
            )

            await judgePanel.init(
                encodeBytes32String("my proposal"),
                [owner, otherAccount],
                BigInt(FIVE_MINUTES),
            )

            await expect(
                judgePanel.connect(owner).commitScore(scoreHash(4n, 5n)),
            ).not.to.be.reverted

            await expect(
                judgePanel.connect(otherAccount).commitScore(scoreHash(9n, 1n)),
            ).not.to.be.reverted
        })

        it("Reveals work", async function () {
            const { judgePanel, owner, otherAccount } = await loadFixture(
                deployJudgePanel,
            )

            await judgePanel.init(
                encodeBytes32String("my proposal"),
                [owner, otherAccount],
                FIVE_MINUTES,
            )

            await judgePanel.connect(owner).commitScore(scoreHash(4n, 1n))
            await judgePanel
                .connect(otherAccount)
                .commitScore(scoreHash(6n, 2n))

            await expect(judgePanel.startReveal()).to.be.reverted

            await time.increase(FIVE_MINUTES + 1)
            await judgePanel.startReveal()

            await expect(judgePanel.connect(owner).revealScore(4n, 1n)).not.to
                .be.reverted

            await expect(judgePanel.connect(otherAccount).revealScore(5n, 1n))
                .to.be.reverted
        })

        it("Calculates the right median", async function () {
            const { judgePanel, owner, otherAccount, thirdAccount } =
                await loadFixture(deployJudgePanel)

            await judgePanel.init(
                encodeBytes32String("my proposal"),
                [owner, otherAccount, thirdAccount],
                BigInt(FIVE_MINUTES),
            )

            await judgePanel.connect(owner).commitScore(scoreHash(4n, 1n))

            // can't vote twice
            await expect(
                judgePanel.connect(owner).commitScore(scoreHash(4n, 1n)),
            ).to.be.revertedWith(ERRORS.onlyOneVote)

            await judgePanel
                .connect(otherAccount)
                .commitScore(scoreHash(6n, 2n))

            await judgePanel
                .connect(thirdAccount)
                .commitScore(scoreHash(8n, 2n))

            await time.increase(FIVE_MINUTES + 1)
            await judgePanel.startReveal()

            await judgePanel.connect(owner).revealScore(4n, 1n)

            await expect(judgePanel.finalize()).to.be.revertedWith(
                ERRORS.notAllJudges,
            )

            await judgePanel.connect(otherAccount).revealScore(6n, 2n)
            await judgePanel.connect(thirdAccount).revealScore(8n, 2n)

            await judgePanel.finalize()

            expect(await judgePanel.getMedian()).to.eq(6n)
        })
    })
})
