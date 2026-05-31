#include <emscripten/bind.h>

#include "BulletCollision/BroadphaseCollision/btDbvtBroadphase.h"
#include "BulletCollision/CollisionDispatch/btCollisionDispatcher.h"
#include "BulletCollision/CollisionDispatch/btDefaultCollisionConfiguration.h"
#include "BulletCollision/CollisionShapes/btBoxShape.h"
#include "BulletCollision/CollisionShapes/btCapsuleShape.h"
#include "BulletCollision/CollisionShapes/btSphereShape.h"
#include "BulletDynamics/ConstraintSolver/btConeTwistConstraint.h"
#include "BulletDynamics/ConstraintSolver/btGeneric6DofConstraint.h"
#include "BulletDynamics/ConstraintSolver/btGeneric6DofSpringConstraint.h"
#include "BulletDynamics/ConstraintSolver/btHingeConstraint.h"
#include "BulletDynamics/ConstraintSolver/btPoint2PointConstraint.h"
#include "BulletDynamics/ConstraintSolver/btSequentialImpulseConstraintSolver.h"
#include "BulletDynamics/ConstraintSolver/btSliderConstraint.h"
#include "BulletDynamics/Dynamics/btDiscreteDynamicsWorld.h"
#include "BulletDynamics/Dynamics/btRigidBody.h"
#include "LinearMath/btDefaultMotionState.h"
#include "LinearMath/btQuaternion.h"
#include "LinearMath/btTransform.h"
#include "LinearMath/btVector3.h"

using namespace emscripten;

namespace {

void setAdditionalDamping(btRigidBody::btRigidBodyConstructionInfo &info, bool enabled)
{
    info.m_additionalDamping = enabled;
}

void setSplitImpulse(btContactSolverInfo &info, bool enabled)
{
    info.m_splitImpulse = enabled;
}

void setSplitImpulsePenetrationThreshold(btContactSolverInfo &info, btScalar value)
{
    info.m_splitImpulsePenetrationThreshold = value;
}

void setNumIterations(btContactSolverInfo &info, int value)
{
    info.m_numIterations = value;
}

btCollisionDispatcher *createCollisionDispatcher(btDefaultCollisionConfiguration &configuration)
{
    return new btCollisionDispatcher(&configuration);
}

btRigidBody::btRigidBodyConstructionInfo *createRigidBodyConstructionInfo(
    btScalar mass,
    btMotionState &motionState,
    btCollisionShape &shape,
    const btVector3 &inertia)
{
    return new btRigidBody::btRigidBodyConstructionInfo(mass, &motionState, &shape, inertia);
}

btDiscreteDynamicsWorld *createDiscreteDynamicsWorld(
    btCollisionDispatcher &dispatcher,
    btDbvtBroadphase &broadphase,
    btSequentialImpulseConstraintSolver &solver,
    btDefaultCollisionConfiguration &configuration)
{
    return new btDiscreteDynamicsWorld(&dispatcher, &broadphase, &solver, &configuration);
}

btVector3 &transformGetOrigin(btTransform &transform)
{
    return transform.getOrigin();
}

btQuaternion transformGetRotation(const btTransform &transform)
{
    return transform.getRotation();
}

btScalar transformGetRotationX(const btTransform &transform)
{
    return transform.getRotation().x();
}

btScalar transformGetRotationY(const btTransform &transform)
{
    return transform.getRotation().y();
}

btScalar transformGetRotationZ(const btTransform &transform)
{
    return transform.getRotation().z();
}

btScalar transformGetRotationW(const btTransform &transform)
{
    return transform.getRotation().w();
}

btTransform &collisionObjectGetWorldTransform(btCollisionObject &object)
{
    return object.getWorldTransform();
}

const btTransform &rigidBodyGetCenterOfMassTransform(const btRigidBody &body)
{
    return body.getCenterOfMassTransform();
}

btMotionState *rigidBodyGetMotionState(btRigidBody &body)
{
    return body.getMotionState();
}

btPersistentManifold *dispatcherGetManifoldByIndexInternal(btCollisionDispatcher &dispatcher, int index)
{
    return dispatcher.getManifoldByIndexInternal(index);
}

void worldAddRigidBody(btDiscreteDynamicsWorld &world, btRigidBody &body)
{
    world.addRigidBody(&body);
}

void worldAddRigidBodyWithFilter(btDiscreteDynamicsWorld &world, btRigidBody &body, int group, int mask)
{
    world.addRigidBody(&body, group, mask);
}

void worldRemoveRigidBody(btDiscreteDynamicsWorld &world, btRigidBody &body)
{
    world.removeRigidBody(&body);
}

void worldAddConstraint(btDiscreteDynamicsWorld &world, btTypedConstraint &constraint, bool disableCollisionsBetweenLinkedBodies)
{
    world.addConstraint(&constraint, disableCollisionsBetweenLinkedBodies);
}

void worldRemoveConstraint(btDiscreteDynamicsWorld &world, btTypedConstraint &constraint)
{
    world.removeConstraint(&constraint);
}

btCollisionDispatcher *worldGetDispatcher(btDiscreteDynamicsWorld &world)
{
    return static_cast<btCollisionDispatcher *>(world.getDispatcher());
}

btContactSolverInfo &worldGetSolverInfo(btDiscreteDynamicsWorld &world)
{
    return world.getSolverInfo();
}

} // namespace

EMSCRIPTEN_BINDINGS(yw_bullet_ammo_compat)
{
    class_<btVector3>("btVector3")
        .constructor<btScalar, btScalar, btScalar>()
        .function("x", &btVector3::x)
        .function("y", &btVector3::y)
        .function("z", &btVector3::z)
        .function("setValue", &btVector3::setValue);

    class_<btQuaternion>("btQuaternion")
        .constructor<>()
        .constructor<btScalar, btScalar, btScalar, btScalar>()
        .function("x", &btQuaternion::x)
        .function("y", &btQuaternion::y)
        .function("z", &btQuaternion::z)
        .function("w", &btQuaternion::w)
        .function("setValue", select_overload<void(const btScalar &, const btScalar &, const btScalar &, const btScalar &)>(&btQuaternion::setValue));

    class_<btTransform>("btTransform")
        .constructor<>()
        .function("setIdentity", &btTransform::setIdentity)
        .function("setOrigin", &btTransform::setOrigin)
        .function("getOrigin", &transformGetOrigin, allow_raw_pointers())
        .function("setRotation", &btTransform::setRotation)
        .function("getRotation", &transformGetRotation)
        .function("getRotationX", &transformGetRotationX)
        .function("getRotationY", &transformGetRotationY)
        .function("getRotationZ", &transformGetRotationZ)
        .function("getRotationW", &transformGetRotationW);

    class_<btMotionState>("btMotionState")
        .function("getWorldTransform", &btMotionState::getWorldTransform, pure_virtual())
        .function("setWorldTransform", &btMotionState::setWorldTransform, pure_virtual());

    class_<btDefaultMotionState, base<btMotionState>>("btDefaultMotionState")
        .constructor<const btTransform &>()
        .function("getWorldTransform", &btDefaultMotionState::getWorldTransform)
        .function("setWorldTransform", &btDefaultMotionState::setWorldTransform);

    class_<btCollisionShape>("btCollisionShape")
        .function("calculateLocalInertia", &btCollisionShape::calculateLocalInertia)
        .function("setMargin", &btCollisionShape::setMargin);

    class_<btBoxShape, base<btCollisionShape>>("btBoxShape")
        .constructor<const btVector3 &>();

    class_<btCapsuleShape, base<btCollisionShape>>("btCapsuleShape")
        .constructor<btScalar, btScalar>();

    class_<btSphereShape, base<btCollisionShape>>("btSphereShape")
        .constructor<btScalar>();

    class_<btRigidBody::btRigidBodyConstructionInfo>("btRigidBodyConstructionInfo")
        .constructor(&createRigidBodyConstructionInfo)
        .function("set_m_additionalDamping", &setAdditionalDamping);

    class_<btCollisionObject>("btCollisionObject")
        .function("getCollisionFlags", &btCollisionObject::getCollisionFlags)
        .function("setCollisionFlags", &btCollisionObject::setCollisionFlags)
        .function("setWorldTransform", &btCollisionObject::setWorldTransform)
        .function("getWorldTransform", &collisionObjectGetWorldTransform, allow_raw_pointers())
        .function("setActivationState", &btCollisionObject::setActivationState)
        .function("activate", &btCollisionObject::activate)
        .function("setFriction", &btCollisionObject::setFriction)
        .function("setRestitution", &btCollisionObject::setRestitution);

    class_<btRigidBody, base<btCollisionObject>>("btRigidBody")
        .constructor<const btRigidBody::btRigidBodyConstructionInfo &>()
        .function("setDamping", &btRigidBody::setDamping)
        .function("setSleepingThresholds", &btRigidBody::setSleepingThresholds)
        .function("getCenterOfMassTransform", &rigidBodyGetCenterOfMassTransform, allow_raw_pointers())
        .function("setCenterOfMassTransform", &btRigidBody::setCenterOfMassTransform)
        .function("setLinearVelocity", &btRigidBody::setLinearVelocity)
        .function("setAngularVelocity", &btRigidBody::setAngularVelocity)
        .function("applyCentralForce", &btRigidBody::applyCentralForce)
        .function("applyTorqueImpulse", &btRigidBody::applyTorqueImpulse)
        .function("getMotionState", &rigidBodyGetMotionState, allow_raw_pointers());

    class_<btDefaultCollisionConfiguration>("btDefaultCollisionConfiguration")
        .constructor<>();

    class_<btCollisionDispatcher>("btCollisionDispatcher")
        .constructor(&createCollisionDispatcher, allow_raw_pointers())
        .function("getNumManifolds", &btCollisionDispatcher::getNumManifolds)
        .function("getManifoldByIndexInternal", &dispatcherGetManifoldByIndexInternal, allow_raw_pointers());

    class_<btPersistentManifold>("btPersistentManifold")
        .function("getBody0", &btPersistentManifold::getBody0, allow_raw_pointers())
        .function("getBody1", &btPersistentManifold::getBody1, allow_raw_pointers())
        .function("getNumContacts", &btPersistentManifold::getNumContacts)
        .function("getContactPoint", select_overload<btManifoldPoint &(int)>(&btPersistentManifold::getContactPoint), allow_raw_pointers());

    class_<btManifoldPoint>("btManifoldPoint")
        .function("getDistance", &btManifoldPoint::getDistance);

    class_<btDbvtBroadphase>("btDbvtBroadphase")
        .constructor<>();

    class_<btSequentialImpulseConstraintSolver>("btSequentialImpulseConstraintSolver")
        .constructor<>();

    class_<btContactSolverInfo>("btContactSolverInfo")
        .function("set_m_splitImpulse", &setSplitImpulse)
        .function("set_m_splitImpulsePenetrationThreshold", &setSplitImpulsePenetrationThreshold)
        .function("set_m_numIterations", &setNumIterations);

    class_<btDiscreteDynamicsWorld>("btDiscreteDynamicsWorld")
        .constructor(&createDiscreteDynamicsWorld, allow_raw_pointers())
        .function("setGravity", &btDiscreteDynamicsWorld::setGravity)
        .function("addRigidBody", &worldAddRigidBody)
        .function("addRigidBody", &worldAddRigidBodyWithFilter)
        .function("removeRigidBody", &worldRemoveRigidBody)
        .function("addConstraint", &worldAddConstraint)
        .function("removeConstraint", &worldRemoveConstraint)
        .function("getDispatcher", &worldGetDispatcher, allow_raw_pointers())
        .function("getSolverInfo", &worldGetSolverInfo, allow_raw_pointers())
        .function("stepSimulation", select_overload<int(btScalar, int, btScalar)>(&btDiscreteDynamicsWorld::stepSimulation));

    class_<btTypedConstraint>("btTypedConstraint")
        .function("setParam", &btTypedConstraint::setParam);

    class_<btGeneric6DofConstraint, base<btTypedConstraint>>("btGeneric6DofConstraint")
        .constructor<btRigidBody &, btRigidBody &, const btTransform &, const btTransform &, bool>()
        .function("setLinearLowerLimit", &btGeneric6DofConstraint::setLinearLowerLimit)
        .function("setLinearUpperLimit", &btGeneric6DofConstraint::setLinearUpperLimit)
        .function("setAngularLowerLimit", &btGeneric6DofConstraint::setAngularLowerLimit)
        .function("setAngularUpperLimit", &btGeneric6DofConstraint::setAngularUpperLimit);

    class_<btGeneric6DofSpringConstraint, base<btGeneric6DofConstraint>>("btGeneric6DofSpringConstraint")
        .constructor<btRigidBody &, btRigidBody &, const btTransform &, const btTransform &, bool>()
        .function("enableSpring", &btGeneric6DofSpringConstraint::enableSpring)
        .function("setStiffness", &btGeneric6DofSpringConstraint::setStiffness)
        .function("setEquilibriumPoint", select_overload<void()>(&btGeneric6DofSpringConstraint::setEquilibriumPoint))
        .function("setEquilibriumPoint", select_overload<void(int)>(&btGeneric6DofSpringConstraint::setEquilibriumPoint));

    class_<btPoint2PointConstraint, base<btTypedConstraint>>("btPoint2PointConstraint")
        .constructor<btRigidBody &, btRigidBody &, const btVector3 &, const btVector3 &>()
        .function("setPivotA", &btPoint2PointConstraint::setPivotA)
        .function("setPivotB", &btPoint2PointConstraint::setPivotB);

    class_<btConeTwistConstraint, base<btTypedConstraint>>("btConeTwistConstraint")
        .constructor<btRigidBody &, btRigidBody &, const btTransform &, const btTransform &>()
        .function("setLimit", select_overload<void(btScalar, btScalar, btScalar, btScalar, btScalar, btScalar)>(&btConeTwistConstraint::setLimit))
        .function("setDamping", &btConeTwistConstraint::setDamping);

    class_<btSliderConstraint, base<btTypedConstraint>>("btSliderConstraint")
        .constructor<btRigidBody &, btRigidBody &, const btTransform &, const btTransform &, bool>()
        .function("setLowerLinLimit", &btSliderConstraint::setLowerLinLimit)
        .function("setUpperLinLimit", &btSliderConstraint::setUpperLinLimit)
        .function("setLowerAngLimit", &btSliderConstraint::setLowerAngLimit)
        .function("setUpperAngLimit", &btSliderConstraint::setUpperAngLimit);

    class_<btHingeConstraint, base<btTypedConstraint>>("btHingeConstraint")
        .constructor<btRigidBody &, btRigidBody &, const btTransform &, const btTransform &, bool>()
        .function("setLimit", select_overload<void(btScalar, btScalar, btScalar, btScalar, btScalar)>(&btHingeConstraint::setLimit));
}
