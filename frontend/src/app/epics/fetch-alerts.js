/* Copyright (C) 2016 NooBaa */

import { mergeMap } from 'rxjs/operators';
import { ofType } from 'rx-extensions';
import { mapErrorObject } from 'utils/state-utils';
import { FETCH_ALERTS } from 'action-types';
import { completeFetchAlerts, failFetchAlerts } from 'action-creators';

export default function(action$, { api }) {
    return action$.pipe(
        ofType(FETCH_ALERTS),
        mergeMap(async action => {
            const { query, limit } = action.payload;

            try {
                const list = await api.events.read_alerts({ query, limit });
                return completeFetchAlerts(limit, list);

            } catch (error) {
                return failFetchAlerts(mapErrorObject(error));
            }
        })
    );
}
