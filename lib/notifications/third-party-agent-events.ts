import type { PoolClient } from "pg"
import { notificationService } from "./notification-service"
import { NotificationTemplates } from "./notification-types"
import type { CreateNotificationInput } from "./notification-types"
import {
  getInstitutionRecipientsWithPermission,
  type AdminRecipient,
} from "./admin-recipients"

const PERMISSIONS = {
  viewAgents: "view_third_party_agents",
} as const

export interface ThirdPartyAgentActor {
  id: string
  institution_id: string
  branch_id: string
}

export interface ThirdPartyAgentRecord {
  id: string
  name: string
}

export interface NotifyThirdPartyAgentCreatedInput {
  client?: PoolClient
  actor: ThirdPartyAgentActor
  agent: ThirdPartyAgentRecord
}

export interface NotifyThirdPartyAgentCreatedResult {
  ok: boolean
  staffNotifications: number
  errors: string[]
}

/**
 * Notify institution staff who can view third-party agents when a new agent is
 * created. The creating staff member (actor) is excluded from recipients.
 */
export async function notifyThirdPartyAgentCreated(
  input: NotifyThirdPartyAgentCreatedInput,
): Promise<NotifyThirdPartyAgentCreatedResult> {
  const errors: string[] = []
  let staffNotifications = 0
  const { actor, agent } = input

  if (!input.client) {
    return { ok: true, staffNotifications: 0, errors: [] }
  }

  let recipients: AdminRecipient[] = []
  try {
    recipients = await getInstitutionRecipientsWithPermission(
      input.client,
      actor.institution_id,
      PERMISSIONS.viewAgents,
      { excludeUserId: actor.id },
    )
  } catch (e) {
    errors.push(`recipients:${(e as Error)?.message || "lookup_failed"}`)
    return { ok: false, staffNotifications: 0, errors }
  }

  if (recipients.length === 0) {
    return { ok: true, staffNotifications: 0, errors }
  }

  const tpl = NotificationTemplates.thirdPartyAgentCreatedForStaff(agent.name)
  const metadata: CreateNotificationInput["metadata"] = {
    third_party_agent_id: agent.id,
    third_party_agent_name: agent.name,
  }

  const messages: CreateNotificationInput[] = recipients.map((r) => ({
    institutionId: actor.institution_id,
    branchId: r.branch_id ?? actor.branch_id,
    recipientType: "institution_user",
    recipientId: r.id,
    type: "third_party_agent_created",
    title: tpl.title,
    message: tpl.message,
    actionUrl: tpl.actionUrl,
    metadata,
  }))

  const res = await notificationService.createBulk(messages, input.client)
  if (res.ok) {
    staffNotifications = res.count ?? messages.length
  } else if (res.error) {
    errors.push(`staff_notifications:third_party_agent_created:${res.error}`)
  }

  return { ok: errors.length === 0, staffNotifications, errors }
}

export interface NotifyThirdPartyAgentUpdatedInput {
  client?: PoolClient
  actor: ThirdPartyAgentActor
  agent: ThirdPartyAgentRecord
  updatedFields: string[]
}

export interface NotifyThirdPartyAgentUpdatedResult {
  ok: boolean
  staffNotifications: number
  errors: string[]
}

/**
 * Notify institution staff who can view third-party agents when an agent is
 * updated. The editing staff member (actor) is excluded from recipients.
 */
export async function notifyThirdPartyAgentUpdated(
  input: NotifyThirdPartyAgentUpdatedInput,
): Promise<NotifyThirdPartyAgentUpdatedResult> {
  const errors: string[] = []
  let staffNotifications = 0
  const { actor, agent } = input

  if (!input.client) {
    return { ok: true, staffNotifications: 0, errors: [] }
  }

  let recipients: AdminRecipient[] = []
  try {
    recipients = await getInstitutionRecipientsWithPermission(
      input.client,
      actor.institution_id,
      PERMISSIONS.viewAgents,
      { excludeUserId: actor.id },
    )
  } catch (e) {
    errors.push(`recipients:${(e as Error)?.message || "lookup_failed"}`)
    return { ok: false, staffNotifications: 0, errors }
  }

  if (recipients.length === 0) {
    return { ok: true, staffNotifications: 0, errors: [] }
  }

  const tpl = NotificationTemplates.thirdPartyAgentUpdatedForStaff(agent.name)
  const metadata: CreateNotificationInput["metadata"] = {
    third_party_agent_id: agent.id,
    third_party_agent_name: agent.name,
    updated_fields: input.updatedFields,
  }

  const messages: CreateNotificationInput[] = recipients.map((r) => ({
    institutionId: actor.institution_id,
    branchId: r.branch_id ?? actor.branch_id,
    recipientType: "institution_user",
    recipientId: r.id,
    type: "third_party_agent_updated",
    title: tpl.title,
    message: tpl.message,
    actionUrl: tpl.actionUrl,
    metadata,
  }))

  const res = await notificationService.createBulk(messages, input.client)
  if (res.ok) {
    staffNotifications = res.count ?? messages.length
  } else if (res.error) {
    errors.push(`staff_notifications:third_party_agent_updated:${res.error}`)
  }

  return { ok: errors.length === 0, staffNotifications, errors }
}
