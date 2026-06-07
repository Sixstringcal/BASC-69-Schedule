import { Pool } from 'mysql2/promise';
import UnofficialRegistrationModel from '../models/UnofficialRegistration';
import { getGroupsConfig, getWCIF, getPersonByWcaUserId } from '../utils/wcif';

export interface UnofficialEventStatus {
    id: string;
    name: string;
    registered: boolean;
}

export interface UnofficialEventsResponse {
    events: UnofficialEventStatus[];
}

class UnofficialEventService {
    static async getForUser(db: Pool, wcaUserId: string): Promise<UnofficialEventsResponse> {
        const config = await getGroupsConfig();
        const unofficialEvents = config.unofficialEvents || [];

        const existing = await UnofficialRegistrationModel.findByWcaUserId(db, wcaUserId);
        const registeredIds = new Set(existing.map(r => r.eventId));

        return {
            events: unofficialEvents.map(e => ({
                id: e.id,
                name: e.name,
                registered: registeredIds.has(e.id)
            }))
        };
    }

    static async register(db: Pool, wcaUserId: string, eventId: string): Promise<void> {
        const config = await getGroupsConfig();
        const event = (config.unofficialEvents || []).find(e => e.id === eventId);
        if (!event) {
            throw new Error(`Unknown unofficial event: ${eventId}`);
        }

        const wcif = await getWCIF();
        const person = await getPersonByWcaUserId(wcif, wcaUserId, db);

        await UnofficialRegistrationModel.createOrIgnore(db, {
            wcaUserId,
            registrantId: person?.registrantId ?? null,
            eventId: event.id,
            eventName: event.name
        });
    }

    static async unregister(db: Pool, wcaUserId: string, eventId: string): Promise<void> {
        await UnofficialRegistrationModel.deleteByWcaUserIdAndEvent(db, wcaUserId, eventId);
    }
}

export default UnofficialEventService;
