import express from 'express'
import prisma from '../../lib/prisma.js'
import { requireAuth } from '../../lib/auth.js'

const router = express.Router()
router.use(requireAuth)

/**
 * GET /api/family/current
 * Returns current family details, members, and invite code
 */
router.get('/current', async (req, res) => {
  try {
    const familyId = req.user.familyId
    if (!familyId) {
      return res.status(404).json({ error: 'You are not currently part of a family.' })
    }

    const family = await prisma.family.findUnique({
      where: { id: familyId },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, email: true, createdAt: true } }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    if (!family) {
      return res.status(404).json({ error: 'Family not found.' })
    }

    const currentMember = family.members.find(m => m.userId === req.user.userId)

    res.json({
      id: family.id,
      name: family.name,
      inviteCode: family.inviteCode,
      createdAt: family.createdAt,
      userRole: currentMember?.role || 'MEMBER',
      members: family.members.map(m => ({
        id: m.id,
        userId: m.userId,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        joinedAt: m.createdAt
      }))
    })
  } catch (err) {
    console.error('[GET /api/family/current]', err)
    res.status(500).json({ error: 'Server error fetching family details' })
  }
})

/**
 * POST /api/family/join
 * Join an existing family using an invite code
 */
router.post('/join', async (req, res) => {
  try {
    const { inviteCode } = req.body
    if (!inviteCode?.trim()) {
      return res.status(400).json({ error: 'Invite code is required' })
    }

    const family = await prisma.family.findUnique({
      where: { inviteCode: inviteCode.trim().toUpperCase() }
    })

    if (!family) {
      return res.status(404).json({ error: 'Invalid invite code. Family not found.' })
    }

    // Check if already member
    const existing = await prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId: family.id, userId: req.user.userId } }
    })

    if (existing) {
      return res.json({ message: 'You are already a member of this family', familyId: family.id })
    }

    // Remove any previous memberships so user is in one active family
    await prisma.familyMember.deleteMany({
      where: { userId: req.user.userId }
    })

    const membership = await prisma.familyMember.create({
      data: {
        familyId: family.id,
        userId: req.user.userId,
        role: 'MEMBER'
      }
    })

    res.json({
      success: true,
      message: `Successfully joined ${family.name}!`,
      familyId: family.id,
      membership
    })
  } catch (err) {
    console.error('[POST /api/family/join]', err)
    res.status(500).json({ error: 'Failed to join family' })
  }
})

/**
 * PUT /api/family/name
 * Rename family (OWNER only)
 */
router.put('/name', async (req, res) => {
  try {
    const { name } = req.body
    if (!name?.trim()) return res.status(400).json({ error: 'Name is required' })

    const familyId = req.user.familyId
    if (!familyId) return res.status(400).json({ error: 'No family found' })

    const member = await prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId: req.user.userId } }
    })
    if (member?.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only the family owner can rename the family.' })
    }

    const updated = await prisma.family.update({
      where: { id: familyId },
      data: { name: name.trim() }
    })

    res.json(updated)
  } catch (err) {
    console.error('[PUT /api/family/name]', err)
    res.status(500).json({ error: 'Failed to update family name' })
  }
})

/**
 * POST /api/family/invite-code/regenerate
 * Regenerates invite code (OWNER only)
 */
router.post('/invite-code/regenerate', async (req, res) => {
  try {
    const familyId = req.user.familyId
    if (!familyId) return res.status(400).json({ error: 'No family found' })

    const member = await prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId: req.user.userId } }
    })
    if (member?.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only the family owner can regenerate the invite code.' })
    }

    const newCode = 'FAM-' + Math.random().toString(36).substring(2, 8).toUpperCase()
    const updated = await prisma.family.update({
      where: { id: familyId },
      data: { inviteCode: newCode }
    })

    res.json({ success: true, inviteCode: updated.inviteCode })
  } catch (err) {
    console.error('[POST /api/family/invite-code/regenerate]', err)
    res.status(500).json({ error: 'Failed to regenerate invite code' })
  }
})

/**
 * DELETE /api/family/members/:userId
 * Remove a member from the family (OWNER only)
 */
router.delete('/members/:userId', async (req, res) => {
  try {
    const familyId = req.user.familyId
    const targetUserId = req.params.userId

    if (targetUserId === req.user.userId) {
      return res.status(400).json({ error: 'You cannot remove yourself from your own family.' })
    }

    const member = await prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId: req.user.userId } }
    })
    if (member?.role !== 'OWNER') {
      return res.status(403).json({ error: 'Only the family owner can remove members.' })
    }

    await prisma.familyMember.delete({
      where: { familyId_userId: { familyId, userId: targetUserId } }
    })

    res.json({ success: true, message: 'Member removed from family' })
  } catch (err) {
    console.error('[DELETE /api/family/members/:userId]', err)
    res.status(500).json({ error: 'Failed to remove member' })
  }
})

export default router
