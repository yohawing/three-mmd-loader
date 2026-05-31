#include <algorithm>
#include <cstdlib>
#include <cstdint>
#include <cstring>
#include <limits>
#include <vector>

#include <emscripten/emscripten.h>

#include "BulletCollision/BroadphaseCollision/btDbvtBroadphase.h"
#include "BulletCollision/CollisionDispatch/btCollisionDispatcher.h"
#include "BulletCollision/CollisionDispatch/btDefaultCollisionConfiguration.h"
#include "BulletCollision/CollisionShapes/btBoxShape.h"
#include "BulletCollision/CollisionShapes/btCapsuleShape.h"
#include "BulletCollision/CollisionShapes/btSphereShape.h"
#include "BulletDynamics/ConstraintSolver/btGeneric6DofSpringConstraint.h"
#include "BulletDynamics/ConstraintSolver/btSequentialImpulseConstraintSolver.h"
#include "BulletDynamics/Dynamics/btDiscreteDynamicsWorld.h"
#include "BulletDynamics/Dynamics/btRigidBody.h"
#include "LinearMath/btDefaultMotionState.h"
#include "LinearMath/btTransform.h"
#include "LinearMath/btVector3.h"

namespace {

constexpr int MOTION_STATIC = 0;
constexpr int MOTION_DYNAMIC = 1;
constexpr int MOTION_DYNAMIC_WITH_BONE = 2;
constexpr int SHAPE_SPHERE = 0;
constexpr int SHAPE_BOX = 1;
constexpr int SHAPE_CAPSULE = 2;
constexpr int CF_KINEMATIC_OBJECT = 2;
constexpr int CF_NO_CONTACT_RESPONSE = 4;
constexpr int YW_ACTIVE_TAG = 1;
constexpr int YW_DISABLE_DEACTIVATION = 4;
constexpr btScalar DISABLED_TARGET_FORCE_FACTOR = btScalar(30);
constexpr btScalar MIN_SHAPE_SIZE = btScalar(0.001);
constexpr btScalar MIN_DYNAMIC_BODY_MASS = btScalar(0.001);
constexpr btScalar DEFAULT_FIXED_TIME_STEP = btScalar(1.0 / 60.0);
constexpr int DEFAULT_MAX_SUB_STEPS = 5;
constexpr int DEFAULT_RESET_CATCH_UP_STEPS = 0;
constexpr btScalar DEFAULT_DYNAMIC_WITH_BONE_ROTATION_FEEDBACK_SCALE = btScalar(1);
constexpr btScalar DEFAULT_COLLISION_MARGIN = btScalar(-1);
constexpr int DEFAULT_SOLVER_ITERATIONS = 20;
constexpr btScalar DEFAULT_SPLIT_IMPULSE_PENETRATION_THRESHOLD = btScalar(-0.04);
constexpr int BT_CONSTRAINT_STOP_ERP_PARAM = 2;
constexpr btScalar BT_CONSTRAINT_STOP_ERP = btScalar(0.475);
constexpr btScalar AXIS_SIGNS[3] = {btScalar(1), btScalar(1), btScalar(-1)};

struct YwMmdRigidBodyConfig {
    int boneIndex = -1;
    int parentBoneIndex = -1;
    int boneDepth = std::numeric_limits<int>::max();
    int motionType = MOTION_STATIC;
    int shapeType = SHAPE_SPHERE;
    btVector3 size = btVector3(1, 1, 1);
    btVector3 boneRestTranslation = btVector3(0, 0, 0);
    btVector3 localTranslation = btVector3(0, 0, 0);
    btQuaternion localRotation = btQuaternion(0, 0, 0, 1);
    btScalar mass = 0;
    btScalar linearDamping = 0;
    btScalar angularDamping = 0;
    btScalar restitution = 0;
    btScalar friction = btScalar(0.5);
    int group = 1;
    int mask = 0xffff;
};

struct YwMmdRigidBodyBinding {
    YwMmdRigidBodyConfig config;
    btCollisionShape *shape = nullptr;
    btDefaultMotionState *motionState = nullptr;
    btRigidBody *body = nullptr;
    int baseCollisionFlags = 0;
    bool temporalKinematic = false;
    bool physicsEnabled = true;
    bool disabledTargetSync = false;
};

struct YwMmdJointConfig {
    int rigidBodyIndexA = -1;
    int rigidBodyIndexB = -1;
    btVector3 translation = btVector3(0, 0, 0);
    btQuaternion rotation = btQuaternion(0, 0, 0, 1);
    btVector3 linearLower = btVector3(0, 0, 0);
    btVector3 linearUpper = btVector3(0, 0, 0);
    btVector3 angularLower = btVector3(0, 0, 0);
    btVector3 angularUpper = btVector3(0, 0, 0);
    btVector3 springLinear = btVector3(0, 0, 0);
    btVector3 springAngular = btVector3(0, 0, 0);
};

struct YwMmdBulletWorld {
    btDefaultCollisionConfiguration *configuration = nullptr;
    btCollisionDispatcher *dispatcher = nullptr;
    btDbvtBroadphase *broadphase = nullptr;
    btSequentialImpulseConstraintSolver *solver = nullptr;
    btDiscreteDynamicsWorld *world = nullptr;
    int boneCount = 0;
    float *inputTranslations = nullptr;
    float *inputRotations = nullptr;
    float *inputWorldMatrices = nullptr;
    float *outputTranslations = nullptr;
    float *outputRotations = nullptr;
    float *outputWorldMatrices = nullptr;
    float *rigidBodyWorldMatrices = nullptr;
    float *contactDebugData = nullptr;
    unsigned char *bonePhysicsToggles = nullptr;
    unsigned int *updatedBoneIndices = nullptr;
    btScalar fixedTimeStep = DEFAULT_FIXED_TIME_STEP;
    int maxSubSteps = DEFAULT_MAX_SUB_STEPS;
    int resetCatchUpSteps = DEFAULT_RESET_CATCH_UP_STEPS;
    btScalar dynamicWithBoneRotationFeedbackScale = DEFAULT_DYNAMIC_WITH_BONE_ROTATION_FEEDBACK_SCALE;
    btScalar collisionMargin = DEFAULT_COLLISION_MARGIN;
    int solverIterations = DEFAULT_SOLVER_ITERATIONS;
    bool splitImpulse = true;
    btScalar splitImpulsePenetrationThreshold = DEFAULT_SPLIT_IMPULSE_PENETRATION_THRESHOLD;
    std::vector<YwMmdRigidBodyConfig> pendingRigidBodies;
    std::vector<YwMmdJointConfig> pendingJoints;
    std::vector<YwMmdRigidBodyBinding> rigidBodies;
    std::vector<int> rigidBodySyncOrder;
    std::vector<btTypedConstraint *> constraints;
    const void *modelIdentity = nullptr;
};

template <typename T>
bool ensureBuffer(T *&buffer, int count)
{
    if (count <= 0) {
        std::free(buffer);
        buffer = nullptr;
        return true;
    }
    void *next = std::realloc(buffer, sizeof(T) * static_cast<size_t>(count));
    if (!next) {
        return false;
    }
    buffer = static_cast<T *>(next);
    return true;
}

bool ensureStepBuffers(YwMmdBulletWorld *world, int boneCount)
{
    if (!world || boneCount < 0) {
        return false;
    }
    const int translationValueCount = boneCount * 3;
    const int rotationValueCount = boneCount * 4;
    const int matrixValueCount = boneCount * 16;
    if (!ensureBuffer(world->inputTranslations, translationValueCount) ||
        !ensureBuffer(world->inputRotations, rotationValueCount) ||
        !ensureBuffer(world->inputWorldMatrices, matrixValueCount) ||
        !ensureBuffer(world->outputTranslations, translationValueCount) ||
        !ensureBuffer(world->outputRotations, rotationValueCount) ||
        !ensureBuffer(world->outputWorldMatrices, matrixValueCount) ||
        !ensureBuffer(world->bonePhysicsToggles, boneCount) ||
        !ensureBuffer(world->updatedBoneIndices, boneCount)) {
        return false;
    }
    world->boneCount = boneCount;
    return true;
}

void freeStepBuffers(YwMmdBulletWorld *world)
{
    if (!world) {
        return;
    }
    std::free(world->inputTranslations);
    std::free(world->inputRotations);
    std::free(world->inputWorldMatrices);
    std::free(world->outputTranslations);
    std::free(world->outputRotations);
    std::free(world->outputWorldMatrices);
    std::free(world->rigidBodyWorldMatrices);
    std::free(world->contactDebugData);
    std::free(world->bonePhysicsToggles);
    std::free(world->updatedBoneIndices);
}

btScalar safeShapeSize(btScalar value)
{
    return value > MIN_SHAPE_SIZE ? value : MIN_SHAPE_SIZE;
}

btScalar positiveOrDefault(btScalar value, btScalar fallback)
{
    return value > btScalar(0) ? value : fallback;
}

int nonNegativeOrDefault(int value, int fallback)
{
    return value >= 0 ? value : fallback;
}

int positiveIntegerOrDefault(int value, int fallback)
{
    return value > 0 ? value : fallback;
}

btScalar clampedOrDefault(btScalar value, btScalar minValue, btScalar maxValue, btScalar fallback)
{
    if (value != value) {
        return fallback;
    }
    return std::max(minValue, std::min(value, maxValue));
}

btScalar marginOrDefault(btScalar value, btScalar fallback)
{
    if (value != value || value < btScalar(0)) {
        return fallback;
    }
    return value;
}

btVector3 mmdVectorToPhysics(const btVector3 &value)
{
    return btVector3(value.x(), value.y(), -value.z());
}

btQuaternion normalizeQuaternion(const btQuaternion &value)
{
    const btScalar length = btSqrt(
        value.x() * value.x() +
        value.y() * value.y() +
        value.z() * value.z() +
        value.w() * value.w());
    if (length <= btScalar(0)) {
        return btQuaternion(0, 0, 0, 1);
    }
    return btQuaternion(value.x() / length, value.y() / length, value.z() / length, value.w() / length);
}

btQuaternion mmdQuaternionToPhysics(const btQuaternion &value)
{
    return normalizeQuaternion(btQuaternion(-value.x(), -value.y(), value.z(), value.w()));
}

btQuaternion scaleQuaternionDelta(
    const btQuaternion &from,
    const btQuaternion &to,
    btScalar scale)
{
    if (scale <= btScalar(0)) {
        return normalizeQuaternion(from);
    }
    if (scale >= btScalar(1)) {
        return normalizeQuaternion(to);
    }
    return normalizeQuaternion(from.slerp(to, scale));
}

btMatrix3x3 mmdBasisToPhysics(const btMatrix3x3 &basis)
{
    btMatrix3x3 converted;
    for (int row = 0; row < 3; row += 1) {
        for (int column = 0; column < 3; column += 1) {
            converted[row][column] = AXIS_SIGNS[row] * basis[row][column] * AXIS_SIGNS[column];
        }
    }
    return converted;
}

btCollisionShape *createShape(const YwMmdRigidBodyConfig &config)
{
    if (config.shapeType == SHAPE_BOX) {
        return new btBoxShape(btVector3(
            safeShapeSize(config.size.x()),
            safeShapeSize(config.size.y()),
            safeShapeSize(config.size.z())));
    }
    if (config.shapeType == SHAPE_CAPSULE) {
        return new btCapsuleShape(
            safeShapeSize(config.size.x()),
            safeShapeSize(config.size.y()));
    }
    return new btSphereShape(safeShapeSize(config.size.x()));
}

void applyCollisionMargin(YwMmdBulletWorld *state)
{
    if (!state || state->collisionMargin < btScalar(0)) {
        return;
    }
    for (YwMmdRigidBodyBinding &binding : state->rigidBodies) {
        if (binding.shape) {
            binding.shape->setMargin(state->collisionMargin);
        }
    }
}

btTransform readBoneWorldTransform(const YwMmdBulletWorld *state, int boneIndex)
{
    btTransform transform;
    transform.setIdentity();
    if (!state || !state->inputWorldMatrices || boneIndex < 0 || boneIndex >= state->boneCount) {
        return transform;
    }
    const float *matrix = state->inputWorldMatrices + boneIndex * 16;
    btMatrix3x3 basis(
        matrix[0], matrix[4], matrix[8],
        matrix[1], matrix[5], matrix[9],
        matrix[2], matrix[6], matrix[10]);
    transform.setBasis(mmdBasisToPhysics(basis));
    transform.setOrigin(mmdVectorToPhysics(btVector3(matrix[12], matrix[13], matrix[14])));
    return transform;
}

btTransform readOutputBoneWorldTransform(const YwMmdBulletWorld *state, int boneIndex)
{
    btTransform transform;
    transform.setIdentity();
    if (!state || !state->outputWorldMatrices || boneIndex < 0 || boneIndex >= state->boneCount) {
        return transform;
    }
    const float *matrix = state->outputWorldMatrices + boneIndex * 16;
    btMatrix3x3 basis(
        matrix[0], matrix[4], matrix[8],
        matrix[1], matrix[5], matrix[9],
        matrix[2], matrix[6], matrix[10]);
    transform.setBasis(mmdBasisToPhysics(basis));
    transform.setOrigin(mmdVectorToPhysics(btVector3(matrix[12], matrix[13], matrix[14])));
    return transform;
}

btTransform readBoneLocalInputTransform(const YwMmdBulletWorld *state, int boneIndex)
{
    btTransform transform;
    transform.setIdentity();
    if (!state || boneIndex < 0 || boneIndex >= state->boneCount) {
        return transform;
    }
    if (state->inputTranslations) {
        transform.setOrigin(mmdVectorToPhysics(btVector3(
            state->inputTranslations[boneIndex * 3],
            state->inputTranslations[boneIndex * 3 + 1],
            state->inputTranslations[boneIndex * 3 + 2])));
    }
    if (state->inputRotations) {
        transform.setRotation(mmdQuaternionToPhysics(btQuaternion(
            state->inputRotations[boneIndex * 4],
            state->inputRotations[boneIndex * 4 + 1],
            state->inputRotations[boneIndex * 4 + 2],
            state->inputRotations[boneIndex * 4 + 3])));
    }
    return transform;
}

btTransform currentBoneWorldTransform(const YwMmdBulletWorld *state, const YwMmdRigidBodyConfig &config)
{
    if (config.parentBoneIndex >= 0 && config.parentBoneIndex < state->boneCount) {
        return readOutputBoneWorldTransform(state, config.parentBoneIndex) *
            readBoneLocalInputTransform(state, config.boneIndex);
    }
    return readBoneWorldTransform(state, config.boneIndex);
}

btTransform bodyInputTransform(const YwMmdBulletWorld *state, const YwMmdRigidBodyConfig &config)
{
    if (config.boneIndex >= 0) {
        btTransform offset;
        offset.setIdentity();
        offset.setOrigin(config.localTranslation - config.boneRestTranslation);
        offset.setRotation(config.localRotation);
        return readBoneWorldTransform(state, config.boneIndex) * offset;
    }
    btTransform transform;
    transform.setIdentity();
    transform.setOrigin(config.localTranslation);
    transform.setRotation(config.localRotation);
    return transform;
}

void writeIdentityMatrix(float *target)
{
    for (int index = 0; index < 16; index += 1) {
        target[index] = 0;
    }
    target[0] = 1;
    target[5] = 1;
    target[10] = 1;
    target[15] = 1;
}

void writeTransformMatrix(float *target, const btTransform &transform)
{
    const btMatrix3x3 basis = mmdBasisToPhysics(transform.getBasis());
    const btVector3 origin = mmdVectorToPhysics(transform.getOrigin());
    target[0] = basis[0][0];
    target[1] = basis[1][0];
    target[2] = basis[2][0];
    target[3] = 0;
    target[4] = basis[0][1];
    target[5] = basis[1][1];
    target[6] = basis[2][1];
    target[7] = 0;
    target[8] = basis[0][2];
    target[9] = basis[1][2];
    target[10] = basis[2][2];
    target[11] = 0;
    target[12] = origin.x();
    target[13] = origin.y();
    target[14] = origin.z();
    target[15] = 1;
}

void writeMmdVector(float *target, int boneIndex, const btVector3 &physicsValue)
{
    const btVector3 value = mmdVectorToPhysics(physicsValue);
    target[boneIndex * 3] = value.x();
    target[boneIndex * 3 + 1] = value.y();
    target[boneIndex * 3 + 2] = value.z();
}

void writeMmdQuaternion(float *target, int boneIndex, const btQuaternion &physicsValue)
{
    const btQuaternion value = mmdQuaternionToPhysics(physicsValue);
    target[boneIndex * 4] = value.x();
    target[boneIndex * 4 + 1] = value.y();
    target[boneIndex * 4 + 2] = value.z();
    target[boneIndex * 4 + 3] = value.w();
}

bool shouldReportContactManifold(const YwMmdBulletWorld *state, const btPersistentManifold *manifold)
{
    if (!state || !manifold) {
        return false;
    }
    const int indexA = static_cast<const btCollisionObject *>(manifold->getBody0())->getUserIndex();
    const int indexB = static_cast<const btCollisionObject *>(manifold->getBody1())->getUserIndex();
    if (indexA < 0 ||
        indexB < 0 ||
        indexA >= static_cast<int>(state->rigidBodies.size()) ||
        indexB >= static_cast<int>(state->rigidBodies.size())) {
        return true;
    }
    return state->rigidBodies[indexA].config.motionType != MOTION_STATIC ||
        state->rigidBodies[indexB].config.motionType != MOTION_STATIC;
}

void clearRigidBodies(YwMmdBulletWorld *state)
{
    if (!state) {
        return;
    }
    for (btTypedConstraint *constraint : state->constraints) {
        if (state->world && constraint) {
            state->world->removeConstraint(constraint);
        }
        delete constraint;
    }
    state->constraints.clear();
    for (YwMmdRigidBodyBinding &binding : state->rigidBodies) {
        if (state->world && binding.body) {
            state->world->removeRigidBody(binding.body);
        }
        delete binding.body;
        delete binding.motionState;
        delete binding.shape;
    }
    state->rigidBodies.clear();
    state->rigidBodySyncOrder.clear();
    state->pendingRigidBodies.clear();
    state->pendingJoints.clear();
    state->modelIdentity = nullptr;
}

int collisionGroupMask(int group)
{
    const int clamped = group < 0 ? 0 : (group > 15 ? 15 : group);
    return 1 << clamped;
}

bool isZeroVolumeRigidBody(const YwMmdRigidBodyConfig &config)
{
    if (config.shapeType == SHAPE_BOX) {
        return config.size.x() == 0 || config.size.y() == 0 || config.size.z() == 0;
    }
    if (config.shapeType == SHAPE_CAPSULE) {
        return config.size.x() == 0 || config.size.y() == 0;
    }
    return config.size.x() == 0;
}

int collisionFilterMask(const YwMmdRigidBodyConfig &config)
{
    if (isZeroVolumeRigidBody(config)) {
        return 0;
    }
    return config.mask & 0xffff;
}

bool isBodyPhysicsEnabled(const YwMmdBulletWorld *state, const YwMmdRigidBodyConfig &config);

bool isDynamicRigidBody(const YwMmdRigidBodyConfig &config)
{
    return config.motionType == MOTION_DYNAMIC || config.motionType == MOTION_DYNAMIC_WITH_BONE;
}

void resetRigidBodyVelocity(btRigidBody *body)
{
    if (!body) {
        return;
    }
    body->setLinearVelocity(btVector3(0, 0, 0));
    body->setAngularVelocity(btVector3(0, 0, 0));
}

void setRigidBodyWorldTransform(YwMmdBulletWorld *state, YwMmdRigidBodyBinding &binding, const btTransform &transform)
{
    binding.body->setCenterOfMassTransform(transform);
    binding.body->getMotionState()->setWorldTransform(transform);
    binding.body->activate(true);
    if (state && state->world) {
        state->world->updateSingleAabb(binding.body);
    }
}

void refreshRigidBodyBroadphasePairs(YwMmdBulletWorld *state, btRigidBody *body)
{
    if (!state || !state->world || !state->broadphase || !state->dispatcher || !body) {
        return;
    }
    btBroadphaseProxy *proxy = body->getBroadphaseHandle();
    if (!proxy) {
        return;
    }
    state->broadphase->getOverlappingPairCache()->cleanProxyFromPairs(proxy, state->dispatcher);
    state->world->refreshBroadphaseProxy(body);
}

void setRigidBodyCollisionFlags(YwMmdBulletWorld *state, btRigidBody *body, int flags)
{
    if (!body || body->getCollisionFlags() == flags) {
        return;
    }
    body->setCollisionFlags(flags);
    refreshRigidBodyBroadphasePairs(state, body);
}

bool makeTemporalKinematic(YwMmdBulletWorld *state, YwMmdRigidBodyBinding &binding)
{
    if (!isDynamicRigidBody(binding.config)) {
        return false;
    }
    setRigidBodyCollisionFlags(state, binding.body, binding.baseCollisionFlags | CF_KINEMATIC_OBJECT);
    binding.body->setActivationState(YW_DISABLE_DEACTIVATION);
    return true;
}

void restoreTemporalKinematicBodies(YwMmdBulletWorld *state)
{
    if (!state) {
        return;
    }
    for (YwMmdRigidBodyBinding &binding : state->rigidBodies) {
        if (!binding.temporalKinematic) {
            continue;
        }
        setRigidBodyCollisionFlags(state, binding.body, binding.baseCollisionFlags);
        binding.body->setActivationState(YW_ACTIVE_TAG);
        resetRigidBodyVelocity(binding.body);
        binding.body->activate(true);
        binding.temporalKinematic = false;
    }
}

bool shouldUseDisabledTargetTransform(YwMmdBulletWorld *state, const YwMmdRigidBodyBinding &binding)
{
    if (!state || binding.config.motionType == MOTION_STATIC || binding.config.boneIndex < 0) {
        return false;
    }
    int parentBoneIndex = binding.config.parentBoneIndex;
    while (parentBoneIndex >= 0) {
        const YwMmdRigidBodyBinding *parentBinding = nullptr;
        for (const YwMmdRigidBodyBinding &candidate : state->rigidBodies) {
            if (candidate.config.boneIndex == parentBoneIndex) {
                parentBinding = &candidate;
                break;
            }
        }
        if (!parentBinding) {
            return false;
        }
        if (parentBinding->config.motionType == MOTION_STATIC) {
            return false;
        }
        if (isBodyPhysicsEnabled(state, parentBinding->config)) {
            return true;
        }
        if (parentBinding->disabledTargetSync) {
            return true;
        }
        if (!parentBinding->physicsEnabled) {
            return false;
        }
        parentBoneIndex = parentBinding->config.parentBoneIndex;
    }
    return false;
}

void driveRigidBodyTowardTransform(YwMmdRigidBodyBinding &binding, const btTransform &target)
{
    const btTransform current = binding.body->getCenterOfMassTransform();
    const btVector3 linearVelocity =
        (target.getOrigin() - current.getOrigin()) * DISABLED_TARGET_FORCE_FACTOR;
    binding.body->setLinearVelocity(linearVelocity);
    const btQuaternion deltaRotation = target.getRotation() * current.getRotation().inverse();
    btVector3 axis = deltaRotation.getAxis();
    if (!btFuzzyZero(axis.length2())) {
        axis.normalize();
        binding.body->setAngularVelocity(axis * deltaRotation.getAngle() * DISABLED_TARGET_FORCE_FACTOR);
    } else {
        binding.body->setAngularVelocity(btVector3(0, 0, 0));
    }
}

bool commitRigidBodies(YwMmdBulletWorld *state)
{
    if (!state || !state->world) {
        return false;
    }
    for (const YwMmdRigidBodyConfig &config : state->pendingRigidBodies) {
        YwMmdRigidBodyBinding binding;
        binding.config = config;
        binding.shape = createShape(config);
        btTransform transform = bodyInputTransform(state, config);
        binding.motionState = new btDefaultMotionState(transform);
        btScalar mass = config.motionType == MOTION_STATIC
            ? btScalar(0)
            : btMax(config.mass, MIN_DYNAMIC_BODY_MASS);
        btVector3 inertia(0, 0, 0);
        if (mass > 0) {
            binding.shape->calculateLocalInertia(mass, inertia);
        }
        btRigidBody::btRigidBodyConstructionInfo info(mass, binding.motionState, binding.shape, inertia);
        info.m_additionalDamping = true;
        binding.body = new btRigidBody(info);
        binding.body->setUserIndex(static_cast<int>(state->rigidBodies.size()));
        binding.body->setDamping(config.linearDamping, config.angularDamping);
        binding.body->setRestitution(config.restitution);
        binding.body->setFriction(config.friction);
        binding.body->setSleepingThresholds(0, 0);
        if (config.motionType == MOTION_STATIC) {
            binding.body->setCollisionFlags(binding.body->getCollisionFlags() | CF_KINEMATIC_OBJECT);
        }
        if (config.mask == 0 || isZeroVolumeRigidBody(config)) {
            binding.body->setCollisionFlags(binding.body->getCollisionFlags() | CF_NO_CONTACT_RESPONSE);
        }
        binding.baseCollisionFlags = binding.body->getCollisionFlags();
        binding.body->setActivationState(YW_DISABLE_DEACTIVATION);
        state->world->addRigidBody(binding.body, collisionGroupMask(config.group), collisionFilterMask(config));
        state->rigidBodies.push_back(binding);
    }
    state->pendingRigidBodies.clear();
    return true;
}

int rigidBodyBoneDepth(const YwMmdBulletWorld *state, int bodyIndex)
{
    if (!state ||
        bodyIndex < 0 ||
        bodyIndex >= static_cast<int>(state->rigidBodies.size())) {
        return std::numeric_limits<int>::max();
    }
    return state->rigidBodies[bodyIndex].config.boneDepth;
}

void buildRigidBodySyncOrder(YwMmdBulletWorld *state)
{
    if (!state) {
        return;
    }
    state->rigidBodySyncOrder.clear();
    state->rigidBodySyncOrder.reserve(state->rigidBodies.size());
    for (int index = 0; index < static_cast<int>(state->rigidBodies.size()); index += 1) {
        state->rigidBodySyncOrder.push_back(index);
    }
    std::stable_sort(
        state->rigidBodySyncOrder.begin(),
        state->rigidBodySyncOrder.end(),
        [state](int left, int right) {
            return rigidBodyBoneDepth(state, left) < rigidBodyBoneDepth(state, right);
        });
}

void promotePhysicsWithBoneChildren(YwMmdBulletWorld *state)
{
    if (!state) {
        return;
    }
    const auto promoteIfParentPhysics = [state](int candidateIndex, int parentIndex) {
        if (candidateIndex < 0 ||
            parentIndex < 0 ||
            candidateIndex >= static_cast<int>(state->rigidBodies.size()) ||
            parentIndex >= static_cast<int>(state->rigidBodies.size())) {
            return;
        }
        YwMmdRigidBodyBinding &candidate = state->rigidBodies[candidateIndex];
        const YwMmdRigidBodyBinding &parent = state->rigidBodies[parentIndex];
        if (candidate.config.motionType != MOTION_DYNAMIC_WITH_BONE ||
            parent.config.motionType != MOTION_DYNAMIC ||
            candidate.config.boneIndex < 0) {
            return;
        }
        if (candidate.config.parentBoneIndex >= 0 &&
            parent.config.boneIndex == candidate.config.parentBoneIndex) {
            candidate.config.motionType = MOTION_DYNAMIC;
        }
    };

    for (const YwMmdJointConfig &joint : state->pendingJoints) {
        promoteIfParentPhysics(joint.rigidBodyIndexA, joint.rigidBodyIndexB);
        promoteIfParentPhysics(joint.rigidBodyIndexB, joint.rigidBodyIndexA);
    }
}

btTransform rigidBodyLocalTransform(const YwMmdRigidBodyConfig &config)
{
    btTransform transform;
    transform.setIdentity();
    transform.setOrigin(config.boneIndex >= 0
        ? config.localTranslation - config.boneRestTranslation
        : config.localTranslation);
    transform.setRotation(config.localRotation);
    return transform;
}

btTransform rigidBodyRestTransform(const YwMmdRigidBodyConfig &config)
{
    btTransform transform;
    transform.setIdentity();
    transform.setOrigin(config.localTranslation);
    transform.setRotation(config.localRotation);
    return transform;
}

btTransform jointWorldTransform(const YwMmdJointConfig &config)
{
    btTransform transform;
    transform.setIdentity();
    transform.setOrigin(config.translation);
    transform.setRotation(config.rotation);
    return transform;
}

btVector3 mmdLinearLowerLimitToPhysics(const btVector3 &lower, const btVector3 &upper)
{
    return btVector3(lower.x(), lower.y(), -upper.z());
}

btVector3 mmdLinearUpperLimitToPhysics(const btVector3 &lower, const btVector3 &upper)
{
    return btVector3(upper.x(), upper.y(), -lower.z());
}

btVector3 mmdAngularLowerLimitToPhysics(const btVector3 &lower, const btVector3 &upper)
{
    return btVector3(-upper.x(), -upper.y(), lower.z());
}

btVector3 mmdAngularUpperLimitToPhysics(const btVector3 &lower, const btVector3 &upper)
{
    return btVector3(-lower.x(), -lower.y(), upper.z());
}

void configureSpringAxis(
    btGeneric6DofSpringConstraint *constraint,
    int axis,
    btScalar stiffness,
    bool enableWhenZero = false)
{
    if (enableWhenZero || stiffness != 0) {
        constraint->enableSpring(axis, true);
        constraint->setStiffness(axis, stiffness);
    } else {
        constraint->enableSpring(axis, false);
    }
}

bool commitJoints(YwMmdBulletWorld *state)
{
    if (!state || !state->world) {
        return false;
    }
    for (const YwMmdJointConfig &config : state->pendingJoints) {
        if (config.rigidBodyIndexA < 0 ||
            config.rigidBodyIndexB < 0 ||
            config.rigidBodyIndexA >= static_cast<int>(state->rigidBodies.size()) ||
            config.rigidBodyIndexB >= static_cast<int>(state->rigidBodies.size())) {
            continue;
        }
        YwMmdRigidBodyBinding &bindingA = state->rigidBodies[config.rigidBodyIndexA];
        YwMmdRigidBodyBinding &bindingB = state->rigidBodies[config.rigidBodyIndexB];
        const btTransform jointTransform = jointWorldTransform(config);
        const btTransform frameA = rigidBodyRestTransform(bindingA.config).inverse() * jointTransform;
        const btTransform frameB = rigidBodyRestTransform(bindingB.config).inverse() * jointTransform;
        btGeneric6DofSpringConstraint *constraint =
            new btGeneric6DofSpringConstraint(*bindingA.body, *bindingB.body, frameA, frameB, true);
        constraint->setUseFrameOffset(false);
        constraint->setLinearLowerLimit(config.linearLower);
        constraint->setLinearUpperLimit(config.linearUpper);
        constraint->setAngularLowerLimit(config.angularLower);
        constraint->setAngularUpperLimit(config.angularUpper);
        configureSpringAxis(constraint, 0, config.springLinear.x());
        configureSpringAxis(constraint, 1, config.springLinear.y());
        configureSpringAxis(constraint, 2, config.springLinear.z());
        configureSpringAxis(constraint, 3, config.springAngular.x(), true);
        configureSpringAxis(constraint, 4, config.springAngular.y(), true);
        configureSpringAxis(constraint, 5, config.springAngular.z(), true);
        for (int axis = 0; axis < 6; axis += 1) {
            constraint->setParam(BT_CONSTRAINT_STOP_ERP_PARAM, BT_CONSTRAINT_STOP_ERP, axis);
        }
        state->world->addConstraint(constraint, false);
        state->constraints.push_back(constraint);
    }
    state->pendingJoints.clear();
    return true;
}

bool isBodyPhysicsEnabled(const YwMmdBulletWorld *state, const YwMmdRigidBodyConfig &config)
{
    if (!state || !state->bonePhysicsToggles || config.boneIndex < 0 || config.boneIndex >= state->boneCount) {
        return true;
    }
    return state->bonePhysicsToggles[config.boneIndex] != 0;
}

void syncAllBodiesToInputPose(YwMmdBulletWorld *state)
{
    if (!state) {
        return;
    }
    for (YwMmdRigidBodyBinding &binding : state->rigidBodies) {
        const btTransform transform = bodyInputTransform(state, binding.config);
        setRigidBodyWorldTransform(state, binding, transform);
        resetRigidBodyVelocity(binding.body);
        binding.temporalKinematic = makeTemporalKinematic(state, binding);
        binding.physicsEnabled = isBodyPhysicsEnabled(state, binding.config);
        binding.disabledTargetSync = false;
        binding.body->activate(true);
    }
}

btTransform removeRigidBodyOffsetFromBoneWorld(const btTransform &bodyWorld, const YwMmdRigidBodyConfig &config)
{
    const btVector3 offsetPosition = config.boneIndex >= 0
        ? config.localTranslation - config.boneRestTranslation
        : config.localTranslation;
    const btQuaternion boneRotation = bodyWorld.getRotation() * config.localRotation.inverse();
    btTransform boneWorld;
    boneWorld.setIdentity();
    boneWorld.setRotation(boneRotation);
    boneWorld.setOrigin(bodyWorld.getOrigin() - quatRotate(boneRotation, offsetPosition));
    return boneWorld;
}

btTransform boneWorldToLocal(const YwMmdBulletWorld *state, const YwMmdRigidBodyConfig &config, const btTransform &boneWorld)
{
    if (!state || config.parentBoneIndex < 0 || config.parentBoneIndex >= state->boneCount) {
        return boneWorld;
    }
    return readOutputBoneWorldTransform(state, config.parentBoneIndex).inverse() * boneWorld;
}

} // namespace

extern "C" {

EMSCRIPTEN_KEEPALIVE
YwMmdBulletWorld *yw_mmd_bullet_create_world()
{
    YwMmdBulletWorld *state = new YwMmdBulletWorld();
    state->configuration = new btDefaultCollisionConfiguration();
    state->dispatcher = new btCollisionDispatcher(state->configuration);
    state->broadphase = new btDbvtBroadphase();
    state->solver = new btSequentialImpulseConstraintSolver();
    state->world = new btDiscreteDynamicsWorld(
        state->dispatcher,
        state->broadphase,
        state->solver,
        state->configuration);
    state->world->setGravity(btVector3(0, -98.0f, 0));
    btContactSolverInfo &solverInfo = state->world->getSolverInfo();
    solverInfo.m_splitImpulse = true;
    solverInfo.m_splitImpulsePenetrationThreshold = DEFAULT_SPLIT_IMPULSE_PENETRATION_THRESHOLD;
    solverInfo.m_numIterations = DEFAULT_SOLVER_ITERATIONS;
    return state;
}

EMSCRIPTEN_KEEPALIVE
void yw_mmd_bullet_destroy_world(YwMmdBulletWorld *state)
{
    if (!state) {
        return;
    }
    clearRigidBodies(state);
    delete state->world;
    delete state->solver;
    delete state->broadphase;
    delete state->dispatcher;
    delete state->configuration;
    freeStepBuffers(state);
    delete state;
}

EMSCRIPTEN_KEEPALIVE
int yw_mmd_bullet_begin_model(YwMmdBulletWorld *state, int rigidBodyCount, int modelIdentity)
{
    if (!state || rigidBodyCount < 0) {
        return 0;
    }
    clearRigidBodies(state);
    state->pendingRigidBodies.reserve(static_cast<size_t>(rigidBodyCount));
    state->modelIdentity = reinterpret_cast<const void *>(static_cast<intptr_t>(modelIdentity));
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int yw_mmd_bullet_add_rigid_body(
    YwMmdBulletWorld *state,
    int boneIndex,
    int parentBoneIndex,
    int boneDepth,
    int motionType,
    int shapeType,
    float sizeX,
    float sizeY,
    float sizeZ,
    float restX,
    float restY,
    float restZ,
    float localX,
    float localY,
    float localZ,
    float localQx,
    float localQy,
    float localQz,
    float localQw,
    float mass,
    float linearDamping,
    float angularDamping,
    float restitution,
    float friction,
    int group,
    int mask)
{
    if (!state) {
        return 0;
    }
    YwMmdRigidBodyConfig config;
    config.boneIndex = boneIndex;
    config.parentBoneIndex = parentBoneIndex;
    config.boneDepth = boneDepth;
    config.motionType = motionType;
    config.shapeType = shapeType;
    config.size = btVector3(sizeX, sizeY, sizeZ);
    config.boneRestTranslation = mmdVectorToPhysics(btVector3(restX, restY, restZ));
    config.localTranslation = mmdVectorToPhysics(btVector3(localX, localY, localZ));
    config.localRotation = mmdQuaternionToPhysics(btQuaternion(localQx, localQy, localQz, localQw));
    config.mass = mass;
    config.linearDamping = linearDamping;
    config.angularDamping = angularDamping;
    config.restitution = restitution;
    config.friction = friction;
    config.group = group;
    config.mask = mask;
    state->pendingRigidBodies.push_back(config);
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int yw_mmd_bullet_add_joint(
    YwMmdBulletWorld *state,
    int rigidBodyIndexA,
    int rigidBodyIndexB,
    float translationX,
    float translationY,
    float translationZ,
    float rotationX,
    float rotationY,
    float rotationZ,
    float rotationW,
    float linearLowerX,
    float linearLowerY,
    float linearLowerZ,
    float linearUpperX,
    float linearUpperY,
    float linearUpperZ,
    float angularLowerX,
    float angularLowerY,
    float angularLowerZ,
    float angularUpperX,
    float angularUpperY,
    float angularUpperZ,
    float springLinearX,
    float springLinearY,
    float springLinearZ,
    float springAngularX,
    float springAngularY,
    float springAngularZ)
{
    if (!state) {
        return 0;
    }
    YwMmdJointConfig config;
    config.rigidBodyIndexA = rigidBodyIndexA;
    config.rigidBodyIndexB = rigidBodyIndexB;
    const btVector3 linearLower = btVector3(linearLowerX, linearLowerY, linearLowerZ);
    const btVector3 linearUpper = btVector3(linearUpperX, linearUpperY, linearUpperZ);
    const btVector3 angularLower = btVector3(angularLowerX, angularLowerY, angularLowerZ);
    const btVector3 angularUpper = btVector3(angularUpperX, angularUpperY, angularUpperZ);
    config.translation = mmdVectorToPhysics(btVector3(translationX, translationY, translationZ));
    config.rotation = mmdQuaternionToPhysics(btQuaternion(rotationX, rotationY, rotationZ, rotationW));
    config.linearLower = mmdLinearLowerLimitToPhysics(linearLower, linearUpper);
    config.linearUpper = mmdLinearUpperLimitToPhysics(linearLower, linearUpper);
    config.angularLower = mmdAngularLowerLimitToPhysics(angularLower, angularUpper);
    config.angularUpper = mmdAngularUpperLimitToPhysics(angularLower, angularUpper);
    config.springLinear = btVector3(springLinearX, springLinearY, springLinearZ);
    config.springAngular = btVector3(springAngularX, springAngularY, springAngularZ);
    state->pendingJoints.push_back(config);
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int yw_mmd_bullet_commit_model(YwMmdBulletWorld *state)
{
    if (!commitRigidBodies(state)) {
        return 0;
    }
    promotePhysicsWithBoneChildren(state);
    buildRigidBodySyncOrder(state);
    return commitJoints(state) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
int yw_mmd_bullet_model_identity(YwMmdBulletWorld *state)
{
    return state ? static_cast<int>(reinterpret_cast<intptr_t>(state->modelIdentity)) : 0;
}

EMSCRIPTEN_KEEPALIVE
int yw_mmd_bullet_set_tuning(
    YwMmdBulletWorld *state,
    float fixedTimeStep,
    int maxSubSteps,
    int resetCatchUpSteps,
    float dynamicWithBoneRotationFeedbackScale,
    float collisionMargin,
    int solverIterations,
    int splitImpulse,
    float splitImpulsePenetrationThreshold)
{
    if (!state) {
        return 0;
    }
    state->fixedTimeStep = positiveOrDefault(static_cast<btScalar>(fixedTimeStep), DEFAULT_FIXED_TIME_STEP);
    state->maxSubSteps = nonNegativeOrDefault(maxSubSteps, DEFAULT_MAX_SUB_STEPS);
    state->resetCatchUpSteps = nonNegativeOrDefault(resetCatchUpSteps, DEFAULT_RESET_CATCH_UP_STEPS);
    state->dynamicWithBoneRotationFeedbackScale = clampedOrDefault(
        static_cast<btScalar>(dynamicWithBoneRotationFeedbackScale),
        btScalar(0),
        btScalar(1),
        DEFAULT_DYNAMIC_WITH_BONE_ROTATION_FEEDBACK_SCALE);
    state->collisionMargin = marginOrDefault(
        static_cast<btScalar>(collisionMargin),
        DEFAULT_COLLISION_MARGIN);
    state->solverIterations = positiveIntegerOrDefault(solverIterations, DEFAULT_SOLVER_ITERATIONS);
    state->splitImpulse = splitImpulse != 0;
    state->splitImpulsePenetrationThreshold = splitImpulsePenetrationThreshold == splitImpulsePenetrationThreshold
        ? static_cast<btScalar>(splitImpulsePenetrationThreshold)
        : DEFAULT_SPLIT_IMPULSE_PENETRATION_THRESHOLD;
    btContactSolverInfo &solverInfo = state->world->getSolverInfo();
    solverInfo.m_numIterations = state->solverIterations;
    solverInfo.m_splitImpulse = state->splitImpulse;
    solverInfo.m_splitImpulsePenetrationThreshold = state->splitImpulsePenetrationThreshold;
    applyCollisionMargin(state);
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int yw_mmd_bullet_ensure_step_buffers(YwMmdBulletWorld *state, int boneCount)
{
    return ensureStepBuffers(state, boneCount) ? 1 : 0;
}

EMSCRIPTEN_KEEPALIVE
void yw_mmd_bullet_reset_world(YwMmdBulletWorld *state)
{
    if (state && state->world) {
        state->world->clearForces();
        clearRigidBodies(state);
    }
}

EMSCRIPTEN_KEEPALIVE
int yw_mmd_bullet_reset_pose_sync(YwMmdBulletWorld *state, int catchUpSteps)
{
    if (!state || !state->world || state->boneCount <= 0) {
        return 0;
    }
    state->world->clearForces();
    syncAllBodiesToInputPose(state);
    restoreTemporalKinematicBodies(state);
    const int steps = catchUpSteps < 0 ? state->resetCatchUpSteps : catchUpSteps;
    for (int step = 0; step < steps; step += 1) {
        state->world->stepSimulation(state->fixedTimeStep, 0, state->fixedTimeStep);
    }
    return 1;
}

EMSCRIPTEN_KEEPALIVE
int yw_mmd_bullet_step(
    YwMmdBulletWorld *state,
    double seconds,
    double deltaSeconds,
    double frame,
    double frameRate,
    int seeking)
{
    (void)seconds;
    (void)frame;
    (void)frameRate;
    if (!state || !state->world || state->boneCount <= 0) {
        return 0;
    }
    if (seeking) {
        state->world->clearForces();
    }
    const int translationValueCount = state->boneCount * 3;
    const int rotationValueCount = state->boneCount * 4;
    const int matrixValueCount = state->boneCount * 16;
    std::memcpy(state->outputTranslations, state->inputTranslations, sizeof(float) * translationValueCount);
    std::memcpy(state->outputRotations, state->inputRotations, sizeof(float) * rotationValueCount);
    std::memcpy(state->outputWorldMatrices, state->inputWorldMatrices, sizeof(float) * matrixValueCount);
    for (YwMmdRigidBodyBinding &binding : state->rigidBodies) {
        binding.disabledTargetSync = false;
        const bool physicsEnabled = isBodyPhysicsEnabled(state, binding.config);
        if (binding.config.motionType == MOTION_STATIC) {
            const btTransform transform = bodyInputTransform(state, binding.config);
            setRigidBodyWorldTransform(state, binding, transform);
            resetRigidBodyVelocity(binding.body);
            setRigidBodyCollisionFlags(state, binding.body, binding.baseCollisionFlags | CF_KINEMATIC_OBJECT);
            binding.body->setActivationState(YW_DISABLE_DEACTIVATION);
            binding.physicsEnabled = true;
            continue;
        }
        if (seeking) {
            const btTransform transform = bodyInputTransform(state, binding.config);
            setRigidBodyWorldTransform(state, binding, transform);
            resetRigidBodyVelocity(binding.body);
            binding.temporalKinematic = makeTemporalKinematic(state, binding);
            binding.physicsEnabled = physicsEnabled;
            continue;
        }
        if (!physicsEnabled) {
            const btTransform target = bodyInputTransform(state, binding.config);
            if (shouldUseDisabledTargetTransform(state, binding)) {
                binding.disabledTargetSync = true;
                setRigidBodyCollisionFlags(state, binding.body, binding.baseCollisionFlags);
                binding.body->setActivationState(YW_ACTIVE_TAG);
                driveRigidBodyTowardTransform(binding, target);
            } else {
                setRigidBodyWorldTransform(state, binding, target);
                resetRigidBodyVelocity(binding.body);
                setRigidBodyCollisionFlags(state, binding.body, binding.baseCollisionFlags | CF_KINEMATIC_OBJECT);
                binding.body->setActivationState(YW_DISABLE_DEACTIVATION);
            }
            binding.body->activate(true);
            binding.physicsEnabled = false;
            continue;
        }
        setRigidBodyCollisionFlags(state, binding.body, binding.baseCollisionFlags);
        binding.body->setActivationState(
            binding.temporalKinematic ? YW_DISABLE_DEACTIVATION : YW_ACTIVE_TAG);
        if (!binding.physicsEnabled || binding.temporalKinematic) {
            resetRigidBodyVelocity(binding.body);
            binding.body->activate(true);
        }
        binding.physicsEnabled = true;
    }
    if (seeking) {
        restoreTemporalKinematicBodies(state);
        return 0;
    }
    if (deltaSeconds > 0) {
        state->world->stepSimulation(
            static_cast<btScalar>(deltaSeconds),
            state->maxSubSteps,
            state->fixedTimeStep);
    }
    int updatedCount = 0;
    const int syncOrderSize = state->rigidBodySyncOrder.empty()
        ? static_cast<int>(state->rigidBodies.size())
        : static_cast<int>(state->rigidBodySyncOrder.size());
    for (int orderedIndex = 0; orderedIndex < syncOrderSize; orderedIndex += 1) {
        const int bodyIndex = state->rigidBodySyncOrder.empty()
            ? orderedIndex
            : state->rigidBodySyncOrder[orderedIndex];
        YwMmdRigidBodyBinding &binding = state->rigidBodies[bodyIndex];
        const int boneIndex = binding.config.boneIndex;
        if (binding.config.motionType == MOTION_STATIC ||
            !isBodyPhysicsEnabled(state, binding.config) ||
            boneIndex < 0 ||
            boneIndex >= state->boneCount) {
            continue;
        }
        const btTransform &bodyTransform = binding.body->getCenterOfMassTransform();
        btTransform boneWorld = removeRigidBodyOffsetFromBoneWorld(bodyTransform, binding.config);
        if (binding.config.motionType == MOTION_DYNAMIC_WITH_BONE) {
            const btTransform currentBoneWorld = currentBoneWorldTransform(state, binding.config);
            boneWorld.setRotation(scaleQuaternionDelta(
                currentBoneWorld.getRotation(),
                boneWorld.getRotation(),
                state->dynamicWithBoneRotationFeedbackScale));
            boneWorld.setOrigin(currentBoneWorld.getOrigin());
        }
        const btTransform local = boneWorldToLocal(state, binding.config, boneWorld);
        writeMmdVector(state->outputTranslations, boneIndex, local.getOrigin());
        writeMmdQuaternion(state->outputRotations, boneIndex, local.getRotation());
        writeTransformMatrix(state->outputWorldMatrices + boneIndex * 16, boneWorld);
        state->updatedBoneIndices[updatedCount] = static_cast<unsigned int>(boneIndex);
        updatedCount += 1;
    }
    if (deltaSeconds > 0) {
        restoreTemporalKinematicBodies(state);
    }
    if (updatedCount == 0 && state->rigidBodies.empty()) {
        for (int index = 0; index < state->boneCount; index += 1) {
            state->updatedBoneIndices[index] = static_cast<unsigned int>(index);
        }
        return state->boneCount;
    }
    return updatedCount;
}

EMSCRIPTEN_KEEPALIVE
float *yw_mmd_bullet_input_translations(YwMmdBulletWorld *state) { return state ? state->inputTranslations : nullptr; }
EMSCRIPTEN_KEEPALIVE
float *yw_mmd_bullet_input_rotations(YwMmdBulletWorld *state) { return state ? state->inputRotations : nullptr; }
EMSCRIPTEN_KEEPALIVE
float *yw_mmd_bullet_input_world_matrices(YwMmdBulletWorld *state) { return state ? state->inputWorldMatrices : nullptr; }
EMSCRIPTEN_KEEPALIVE
float *yw_mmd_bullet_output_translations(YwMmdBulletWorld *state) { return state ? state->outputTranslations : nullptr; }
EMSCRIPTEN_KEEPALIVE
float *yw_mmd_bullet_output_rotations(YwMmdBulletWorld *state) { return state ? state->outputRotations : nullptr; }
EMSCRIPTEN_KEEPALIVE
float *yw_mmd_bullet_output_world_matrices(YwMmdBulletWorld *state) { return state ? state->outputWorldMatrices : nullptr; }
EMSCRIPTEN_KEEPALIVE
unsigned char *yw_mmd_bullet_bone_physics_toggles(YwMmdBulletWorld *state) { return state ? state->bonePhysicsToggles : nullptr; }
EMSCRIPTEN_KEEPALIVE
unsigned int *yw_mmd_bullet_updated_bone_indices(YwMmdBulletWorld *state) { return state ? state->updatedBoneIndices : nullptr; }

EMSCRIPTEN_KEEPALIVE
int yw_mmd_bullet_debug_contact_count(YwMmdBulletWorld *state)
{
    if (!state || !state->world || !state->world->getDispatcher()) {
        return 0;
    }
    btDispatcher *dispatcher = state->world->getDispatcher();
    int contactCount = 0;
    const int manifoldCount = dispatcher->getNumManifolds();
    for (int manifoldIndex = 0; manifoldIndex < manifoldCount; manifoldIndex += 1) {
        btPersistentManifold *manifold = dispatcher->getManifoldByIndexInternal(manifoldIndex);
        if (!shouldReportContactManifold(state, manifold)) {
            continue;
        }
        const int pointCount = manifold->getNumContacts();
        for (int pointIndex = 0; pointIndex < pointCount; pointIndex += 1) {
            const btManifoldPoint &point = manifold->getContactPoint(pointIndex);
            if (point.getDistance() <= btScalar(0.0)) {
                contactCount += 1;
            }
        }
    }
    return contactCount;
}

EMSCRIPTEN_KEEPALIVE
int yw_mmd_bullet_debug_contact_pair_count(YwMmdBulletWorld *state)
{
    if (!state || !state->world || !state->world->getDispatcher()) {
        return 0;
    }
    btDispatcher *dispatcher = state->world->getDispatcher();
    int pairCount = 0;
    const int manifoldCount = dispatcher->getNumManifolds();
    for (int manifoldIndex = 0; manifoldIndex < manifoldCount; manifoldIndex += 1) {
        btPersistentManifold *manifold = dispatcher->getManifoldByIndexInternal(manifoldIndex);
        if (!shouldReportContactManifold(state, manifold) || manifold->getNumContacts() <= 0) {
            continue;
        }
        btScalar minDistance = SIMD_INFINITY;
        for (int pointIndex = 0; pointIndex < manifold->getNumContacts(); pointIndex += 1) {
            const btManifoldPoint &point = manifold->getContactPoint(pointIndex);
            minDistance = btMin(minDistance, point.getDistance());
        }
        if (minDistance <= btScalar(0.0)) {
            pairCount += 1;
        }
    }
    return pairCount;
}

EMSCRIPTEN_KEEPALIVE
float *yw_mmd_bullet_debug_contact_pairs(YwMmdBulletWorld *state)
{
    if (!state || !state->world || !state->world->getDispatcher()) {
        return nullptr;
    }
    const int pairCount = yw_mmd_bullet_debug_contact_pair_count(state);
    if (pairCount <= 0) {
        std::free(state->contactDebugData);
        state->contactDebugData = nullptr;
        return nullptr;
    }
    if (!ensureBuffer(state->contactDebugData, pairCount * 3)) {
        return nullptr;
    }
    btDispatcher *dispatcher = state->world->getDispatcher();
    int pairIndex = 0;
    const int manifoldCount = dispatcher->getNumManifolds();
    for (int manifoldIndex = 0; manifoldIndex < manifoldCount; manifoldIndex += 1) {
        btPersistentManifold *manifold = dispatcher->getManifoldByIndexInternal(manifoldIndex);
        if (!shouldReportContactManifold(state, manifold) || manifold->getNumContacts() <= 0) {
            continue;
        }
        btScalar minDistance = SIMD_INFINITY;
        for (int pointIndex = 0; pointIndex < manifold->getNumContacts(); pointIndex += 1) {
            const btManifoldPoint &point = manifold->getContactPoint(pointIndex);
            minDistance = btMin(minDistance, point.getDistance());
        }
        if (minDistance > btScalar(0.0)) {
            continue;
        }
        state->contactDebugData[pairIndex * 3] = static_cast<float>(
            static_cast<const btCollisionObject *>(manifold->getBody0())->getUserIndex());
        state->contactDebugData[pairIndex * 3 + 1] = static_cast<float>(
            static_cast<const btCollisionObject *>(manifold->getBody1())->getUserIndex());
        state->contactDebugData[pairIndex * 3 + 2] = static_cast<float>(minDistance);
        pairIndex += 1;
    }
    return state->contactDebugData;
}

EMSCRIPTEN_KEEPALIVE
int yw_mmd_bullet_debug_rigid_body_count(YwMmdBulletWorld *state)
{
    return state ? static_cast<int>(state->rigidBodies.size()) : 0;
}

EMSCRIPTEN_KEEPALIVE
float *yw_mmd_bullet_debug_rigid_body_world_matrices(YwMmdBulletWorld *state)
{
    if (!state) {
        return nullptr;
    }
    const int count = static_cast<int>(state->rigidBodies.size());
    if (count <= 0) {
        std::free(state->rigidBodyWorldMatrices);
        state->rigidBodyWorldMatrices = nullptr;
        return nullptr;
    }
    if (!ensureBuffer(state->rigidBodyWorldMatrices, count * 16)) {
        return nullptr;
    }
    for (int index = 0; index < count; index += 1) {
        const btTransform &transform = state->rigidBodies[index].body->getCenterOfMassTransform();
        writeTransformMatrix(state->rigidBodyWorldMatrices + index * 16, transform);
    }
    return state->rigidBodyWorldMatrices;
}

}
