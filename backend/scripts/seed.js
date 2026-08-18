require("../config/env");
const mongoose = require("mongoose");

const connectDB = require("../config/db");
const Conversation = require("../models/Conversation.model");
const Message = require("../models/Message.model");
const Project = require("../models/Project");
const ProjectTeam = require("../models/ProjectTeam");
const Team = require("../models/Team");
const TeamMember = require("../models/TeamMember");
const User = require("../models/User");
const { ensureInitialPlatformAdmin } = require("../utils/platformBootstrap");
const { normalizeWorkspaceId } = require("../utils/workspace");

const seedAdminUser = async () => {
  try {
    await connectDB();

    const adminEmail = "admin@example.com";
    let existingAdmin = await User.findOne({
      email: adminEmail.toLowerCase(),
    });

    if (!existingAdmin) {
      existingAdmin = await User.create({
        name: "Admin User",
        email: adminEmail,
        password: "admin123",
        role: "Admin",
        workspaceId: normalizeWorkspaceId(),
      });

      console.log("Admin user created");
    } else {
      console.log("Admin user already exists");
    }

    await seedChatData(existingAdmin);
    await ensureInitialPlatformAdmin();
  } catch (error) {
    console.error("Seed failed:", error.message);
    process.exitCode = 1;
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close();
    }
  }
};

const upsertUser = async ({ email, name, role, workspaceId }) => {
  const existingUser = await User.findOne({
    email,
  });

  if (existingUser) {
    return existingUser;
  }

  return User.create({
    name,
    email,
    password: "password123",
    role,
    workspaceId,
  });
};

const seedChatData = async (adminUser) => {
  const workspaceId = normalizeWorkspaceId(adminUser.workspaceId);
  const [manager, teamLead, developer, tester] = await Promise.all([
    upsertUser({
      name: "Maya Manager",
      email: "maya.manager@example.com",
      role: "Manager",
      workspaceId,
    }),
    upsertUser({
      name: "Taylor Lead",
      email: "taylor.lead@example.com",
      role: "Team Lead",
      workspaceId,
    }),
    upsertUser({
      name: "Dev Patel",
      email: "dev.patel@example.com",
      role: "Developer",
      workspaceId,
    }),
    upsertUser({
      name: "Tina Tester",
      email: "tina.tester@example.com",
      role: "Tester",
      workspaceId,
    }),
  ]);

  const team = await Team.findOneAndUpdate(
    {
      name: "Platform QA Squad",
      workspaceId,
    },
    {
      $setOnInsert: {
        name: "Platform QA Squad",
        description: "Seed team for realtime chat verification",
        workspaceId,
        createdBy: adminUser._id,
      },
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );
  const teamUsers = [manager, teamLead, developer, tester];

  await Promise.all(
    teamUsers.map((user) =>
      TeamMember.updateOne(
        {
          teamId: team._id,
          userId: user._id,
        },
        {
          $setOnInsert: {
            teamId: team._id,
            userId: user._id,
          },
        },
        {
          upsert: true,
        }
      )
    )
  );

  let project = await Project.findOne({
    name: "Realtime Bug Triage",
    workspaceId,
  });

  if (!project) {
    project = await Project.create({
      name: "Realtime Bug Triage",
      description: "Seed project for chat channels",
      shortCode: "RBT",
      status: "Active",
      priority: "High",
      themeColor: "#2563EB",
      manager: manager._id,
      projectManager: manager._id,
      teamLead: teamLead._id,
      qaLead: tester._id,
      attachedTeams: [team._id],
      teamIds: [team._id],
      workspaceId,
      createdBy: adminUser._id,
    });
  } else {
    await Project.updateOne(
      {
        _id: project._id,
      },
      {
        $addToSet: {
          attachedTeams: team._id,
          teamIds: team._id,
        },
      }
    );
  }

  await ProjectTeam.updateOne(
    {
      projectId: project._id,
      teamId: team._id,
    },
    {
      $setOnInsert: {
        projectId: project._id,
        teamId: team._id,
      },
    },
    {
      upsert: true,
    }
  );

  const directParticipants = [adminUser._id, developer._id].sort((left, right) =>
    String(left).localeCompare(String(right))
  );
  let directConversation = await Conversation.findOne({
      workspaceId,
      type: "direct",
      participants: {
        $all: directParticipants,
        $size: 2,
      },
    });

  if (!directConversation) {
    directConversation = await Conversation.create({
        type: "direct",
        channelType: "direct",
        participants: directParticipants,
        workspaceId,
        createdBy: adminUser._id,
    });
  }
  const projectParticipants = [
    adminUser._id,
    manager._id,
    teamLead._id,
    developer._id,
    tester._id,
  ];
  const projectConversation = await Conversation.findOneAndUpdate(
    {
      workspaceId,
      channelType: "project",
      projectId: project._id,
    },
    {
      $setOnInsert: {
        type: "group",
        channelType: "project",
        name: project.name,
        projectId: project._id,
        workspaceId,
        createdBy: adminUser._id,
      },
      participants: projectParticipants,
    },
    {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  await seedMessages(directConversation, [
    {
      senderId: adminUser._id,
      message: "Welcome to realtime chat. This direct thread is ready for QA.",
    },
    {
      senderId: developer._id,
      message: "Got it. I will use this for bug handoffs and quick clarifications.",
    },
  ]);
  await seedMessages(projectConversation, [
    {
      senderId: manager._id,
      message: "Project channel created for release triage and test coordination.",
    },
    {
      senderId: tester._id,
      message: "QA will post verification notes here as bugs move through the board.",
    },
  ]);

  console.log("Chat seed data ready");
};

const seedMessages = async (conversation, messages) => {
  const existingCount = await Message.countDocuments({
    conversationId: conversation._id,
  });

  if (existingCount > 0) {
    return;
  }

  const createdMessages = await Message.insertMany(
    messages.map((message) => ({
      conversationId: conversation._id,
      senderId: message.senderId,
      message: message.message,
      seenBy: [
        {
          userId: message.senderId,
          seenAt: new Date(),
        },
      ],
    }))
  );
  const lastMessage = createdMessages[createdMessages.length - 1];

  await Conversation.updateOne(
    {
      _id: conversation._id,
    },
    {
      lastMessage: lastMessage.message,
      lastMessageAt: lastMessage.createdAt,
    }
  );
};

if (require.main === module) {
  seedAdminUser();
}

module.exports = seedAdminUser;
