/* Copyright (C) 2016 NooBaa */
'use strict';

const moment = require('moment');

const _ = require('lodash');
const dbg = require('../../util/debug_module')(__filename);
const os_utils = require('../../util/os_utils');
const Dispatcher = require('../notifications/dispatcher');
const server_rpc = require('../server_rpc');
const system_store = require('../system_services/system_store').get_instance();
const phone_home_utils = require('../../util/phone_home');
const clustering_utils = require('../utils/clustering_utils.js');
const ssl_utils = require('../../util/ssl_utils');
const mongo_utils = require('../../util/mongo_utils.js');
const mongo_client = require('../../util/mongo_client');

const dotenv = require('../../util/dotenv');

let server_conf = {};
let monitoring_status = {};

if (!process.env.PLATFORM) {
    console.log('loading .env file...');
    dotenv.load();
}

async function run() {
    dbg.log0('SERVER_MONITOR: BEGIN');
    monitoring_status = {
        dns_status: "UNKNOWN",
        ph_status: {
            status: "UNKNOWN",
            test_time: moment().unix()
        },
    };
    if (!system_store.is_finished_initial_load) {
        dbg.log0('waiting for system store to load');
        return;
    }
    if (!system_store.data.systems[0]) {
        dbg.log0('system does not exist, skipping');
        return;
    }
    server_conf = system_store.get_local_cluster_info(true);

    await system_store.refresh();
    await run_monitors();

    dbg.log0('SERVER_MONITOR: END. status:', monitoring_status);
    return {
        services: monitoring_status
    };
}

async function run_monitors() {
    const { CONTAINER_PLATFORM } = process.env;
    const is_master = clustering_utils.check_if_master();

    await _check_dns_and_phonehome();
    await _check_internal_ips();
    await _verify_ssl_certs();
    await _check_db_disk_usage();

    // Address auto detection should only run on master machine.
    if (is_master) {
        await _check_address_changes(CONTAINER_PLATFORM);
    }
}

function _check_dns_and_phonehome() {
    dbg.log2('_check_dns_and_phonehome');
    return phone_home_utils.verify_connection_to_phonehome()
        .then(res => {
            switch (res) {
                case "CONNECTED":
                    monitoring_status.dns_status = "OPERATIONAL";
                    monitoring_status.ph_status = {
                        status: "OPERATIONAL",
                        test_time: moment().unix()
                    };
                    break;
                case "MALFORMED_RESPONSE":
                    monitoring_status.dns_status = "OPERATIONAL";
                    monitoring_status.ph_status = {
                        status: "FAULTY",
                        test_time: moment().unix()
                    };
                    break;
                case "CANNOT_CONNECT_PHONEHOME_SERVER":
                    monitoring_status.dns_status = "OPERATIONAL";
                    monitoring_status.ph_status = {
                        status: "UNREACHABLE",
                        test_time: moment().unix()
                    };
                    Dispatcher.instance().alert('MAJOR',
                        system_store.data.systems[0]._id,
                        `Phone home server could not be reached`,
                        Dispatcher.rules.once_daily);
                    break;
                case "CANNOT_CONNECT_INTERNET":
                    monitoring_status.internet_connectivity = "FAULTY";
                    Dispatcher.instance().alert('MAJOR',
                        system_store.data.systems[0]._id,
                        `Phone home server could not be reached, phone home connectivity is used for proactive
                         support product statistics analysis. Check internet connection`,
                        Dispatcher.rules.once_daily);
                    break;
                case "CANNOT_RESOLVE_PHONEHOME_NAME":
                    monitoring_status.dns_status = "FAULTY";
                    Dispatcher.instance().alert('MAJOR',
                        system_store.data.systems[0]._id,
                        `DNS server/s cannot resolve Phone home server name`,
                        Dispatcher.rules.once_daily);
                    break;
                case "CANNOT_REACH_DNS_SERVER":
                    monitoring_status.dns_status = "UNREACHABLE";
                    break;
                default:
                    break;
            }
            if (_.isEmpty(server_conf.dns_servers)) {
                delete monitoring_status.dns_status;
            }
        })
        .catch(err => dbg.warn('Error when trying to check dns and phonehome status.', err.stack || err));
}

function _check_internal_ips() {
    dbg.log2('_check_internal_ips');
    return server_rpc.client.cluster_server.check_cluster_status()
        .then(cluster_status => {
            if (cluster_status && cluster_status.length > 0) {
                monitoring_status.cluster_status = cluster_status;
            }
        })
        .catch(err => {
            monitoring_status.cluster_status = "UNKNOWN";
            dbg.warn(`Error when trying to check cluster servers' status.`, err.stack || err);
        });
}

async function _verify_ssl_certs() {
    dbg.log2('_verify_ssl_certs');
    const updated = await ssl_utils.update_certs_from_disk();
    if (updated) {
        dbg.log0('_verify_ssl_certs: SSL certificates changed, restarting relevant services');
        await os_utils.restart_services([
            'webserver',
            's3rver'
        ]);
    }
}

async function _check_db_disk_usage() {
    dbg.log2('_check_db_disk_usage');
    const client = mongo_client.instance();
    const { fsUsedSize, fsTotalSize } = await mongo_utils.get_db_stats(client);
    if (fsTotalSize - fsUsedSize < 10 * (1024 ** 3)) { // Free is lower than 10GB
        Dispatcher.instance().alert(
            'MAJOR',
            system_store.data.systems[0]._id,
            `NooBaa DB is running low on disk space, it is recommended to increase the disk size of the persistent volume (PV) backing the database`,
            Dispatcher.rules.once_weekly
        );
    }
}

async function _check_address_changes(container_platform) {
    dbg.log2('_check_address_changes');
    try {
        const [system] = system_store.data.systems;
        const system_address = container_platform === 'KUBERNETES' ?
            await os_utils.discover_k8s_services() :
            await os_utils.discover_virtual_appliance_address();

        // This works because the lists are always sorted, see discover_k8s_services().
        if (!_.isEqual(system.system_address, system_address)) {
            await system_store.make_changes({
                update: {
                    systems: [{
                        _id: system.id,
                        $set: { system_address }
                    }]
                }
            });
        }
    } catch (err) {
        dbg.error('Trying to discover address changes failed');
    }
}

// EXPORTS
exports.run = run;
