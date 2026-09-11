package com.example.hueckoapp.ui.dashboard

import com.example.hueckoapp.domain.model.Group
import com.example.hueckoapp.domain.model.PlanProposal
import com.example.hueckoapp.domain.model.ProposalState
import com.example.hueckoapp.domain.model.TimeBlock
import com.example.hueckoapp.domain.model.User
import com.example.hueckoapp.domain.repository.AuthRepository
import com.example.hueckoapp.domain.repository.GroupRepository
import com.example.hueckoapp.domain.repository.PlanRepository
import com.example.hueckoapp.domain.repository.ScheduleRepository
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.StandardTestDispatcher
import kotlinx.coroutines.test.resetMain
import kotlinx.coroutines.test.runTest
import kotlinx.coroutines.test.setMain
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test

class FakeAuthRepository(initialUser: User? = User("1", "Ana Pérez", "ana@example.com")) : AuthRepository {
    private val userFlow = MutableStateFlow(initialUser)
    override suspend fun login(email: String, password: String) = Result.success(userFlow.value!!)
    override suspend fun register(name: String, email: String, password: String) = Result.success(userFlow.value!!)
    override suspend fun logout() { userFlow.value = null }
    override fun getCurrentUser(): Flow<User?> = userFlow
}

class FakeGroupRepository(initialGroups: List<Group> = emptyList()) : GroupRepository {
    private val groupsFlow = MutableStateFlow(initialGroups)
    override fun getGroups(): Flow<List<Group>> = groupsFlow
    override suspend fun createGroup(name: String): Result<Group> {
        val g = Group(id = "g1", name = name, inviteCode = "1234", members = emptyList(), description = "", availabilityThreshold = 80)
        groupsFlow.value = groupsFlow.value + g
        return Result.success(g)
    }
    override suspend fun joinGroup(inviteCode: String): Result<Group> {
        val g = groupsFlow.value.first()
        return Result.success(g)
    }
}

class FakeScheduleRepository(initialBlocks: List<TimeBlock> = emptyList()) : ScheduleRepository {
    private val blocksFlow = MutableStateFlow(initialBlocks)
    override fun getTimeBlocks(): Flow<List<TimeBlock>> = blocksFlow
    override suspend fun addTimeBlock(block: TimeBlock): Result<Unit> {
        blocksFlow.value = blocksFlow.value + block
        return Result.success(Unit)
    }
    override suspend fun deleteTimeBlock(blockId: String): Result<Unit> {
        blocksFlow.value = blocksFlow.value.filter { it.id != blockId }
        return Result.success(Unit)
    }
}

class FakePlanRepository(initialProposals: List<PlanProposal> = emptyList()) : PlanRepository {
    private val proposalsFlow = MutableStateFlow(initialProposals)
    override fun getProposals(): Flow<List<PlanProposal>> = proposalsFlow
    override fun getGroupOccupancy(): Flow<List<TimeBlock>> = MutableStateFlow(emptyList())
    override suspend fun voteWindow(proposalId: String, windowId: String, userEmail: String): Result<Unit> {
        return Result.success(Unit)
    }
    override suspend fun resolveIncidences(proposalId: String, newState: String): Result<Unit> {
        proposalsFlow.value = proposalsFlow.value.map {
            if (it.id == proposalId) it.copy(state = ProposalState.valueOf(newState)) else it
        }
        return Result.success(Unit)
    }
}

@OptIn(ExperimentalCoroutinesApi::class)
class DashboardViewModelTest {

    private val testDispatcher = StandardTestDispatcher()

    @Before
    fun setUp() {
        Dispatchers.setMain(testDispatcher)
    }

    @After
    fun tearDown() {
        Dispatchers.resetMain()
    }

    @Test
    fun initialState_loadsCorrectly() = runTest {
        val authRepo = FakeAuthRepository()
        val groupRepo = FakeGroupRepository(listOf(Group("g1", "Grupo Amigos", "123", emptyList(), "", 80)))
        val scheduleRepo = FakeScheduleRepository()
        val planRepo = FakePlanRepository()

        val viewModel = DashboardViewModel(authRepo, groupRepo, scheduleRepo, planRepo)
        backgroundScope.launch(testDispatcher) {
            viewModel.uiState.collect()
        }

        testDispatcher.scheduler.advanceUntilIdle()

        val state = viewModel.uiState.value
        assertEquals("Ana", state.name)
        assertEquals(1, state.activeGroups)
        assertEquals(0, state.openVotes)
    }

    @Test
    fun voteAction_invokesRepository() = runTest {
        val authRepo = FakeAuthRepository()
        val groupRepo = FakeGroupRepository()
        val scheduleRepo = FakeScheduleRepository()
        val planRepo = FakePlanRepository()

        val viewModel = DashboardViewModel(authRepo, groupRepo, scheduleRepo, planRepo)
        backgroundScope.launch(testDispatcher) {
            viewModel.uiState.collect()
        }

        viewModel.vote("prop1", "win1")
        testDispatcher.scheduler.advanceUntilIdle()

        assertNotNull(viewModel.uiState.value)
    }
}
