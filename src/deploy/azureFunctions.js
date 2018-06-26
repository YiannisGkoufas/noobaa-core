/* Copyright (C) 2016 NooBaa */
'use strict';

require('./setAzureVariables');
const _ = require('lodash');
const util = require('util');
const msRestAzure = require('ms-rest-azure');
const ComputeManagementClient = require('azure-arm-compute');
const NetworkManagementClient = require('azure-arm-network');

const P = require('../util/promise');
const fs = require('fs');
const api = require('../api');
const promise_utils = require('../util/promise_utils');
const azure_storage = require('../util/azure_storage_wrap');
const af = require('../test/utils/agent_functions');
const ops = require('../test/utils/basic_server_ops');

const ADMIN_USER_NAME = 'notadmin';
const QA_USER_NAME = 'qaadmin';
const ADMIN_PASSWORD = '0bj3ctSt0r3!';
const DEFAULT_VMSIZE = 'Standard_B2s';

const DEV_ACTIVATION_KEY = "pe^*pT%*&!&kmJ8nj@jJ6h3=Ry?EVns6MxTkz+JBwkmk_6e" +
    "k&Wy%*=&+f$KE-uB5B&7m$2=YXX9tf&$%xAWn$td+prnbpKb7MCFfdx6S?txE=9bB+SVtKXQay" +
    "zLVbAhqRWHW-JZ=_NCAE!7BVU_t5pe#deWy*d37q6m?KU?VQm?@TqE+Srs9TSGjfv94=32e_a#" +
    "3H5Q7FBgMZd=YSh^J=!hmxeXtFZE$6bG+^r!tQh-Hy2LEk$+V&33e3Z_mDUVd";

const IMAGE_LOCATION = 'https://jenkinsnoobaastorage.blob.core.windows.net/';

const system = {
    name: 'demo',
    email: 'demo@noobaa.com',
    password: 'DeMo1',
    activation_code: DEV_ACTIVATION_KEY
};

const NTP = 'pool.ntp.org';
const TZ = 'Asia/Jerusalem';

const blobSvc = azure_storage.createBlobService();

class AzureFunctions {

    static get ADMIN_USER_NAME() {
        return ADMIN_USER_NAME;
    }

    static get QA_USER_NAME() {
        return QA_USER_NAME;
    }

    static get ADMIN_PASSWORD() {
        return ADMIN_PASSWORD;
    }

    static get DEFAULT_VMSIZE() {
        return DEFAULT_VMSIZE;
    }

    constructor(clientId, domain, secret, subscriptionId, resourceGroupName, location) {
        this.clientId = clientId;
        this.domain = domain;
        this.secret = secret;
        this.subscriptionId = subscriptionId;
        this.resourceGroupName = resourceGroupName;
        this.location = location;
    }

    authenticate() {
        console.log('Connecting to Azure: ');
        return P.fromCallback(callback => msRestAzure.loginWithServicePrincipalSecret(this.clientId, this.secret, this.domain, callback))
            .then(credentials => {
                this.computeClient = new ComputeManagementClient(credentials, this.subscriptionId);
                this.networkClient = new NetworkManagementClient(credentials, this.subscriptionId);
            })
            .catch(err => console.log('Error', err));
    }

    getImagesfromOSname(osname) {
        var os = {
            // Ubuntu 14 config - default
            publisher: 'Canonical',
            offer: 'UbuntuServer',
            sku: '14.04.5-LTS',
            version: 'latest',
            osType: 'Linux',
            hasImage: true
        };
        if (osname === 'ubuntu16') {
            // Ubuntu 16 config
            os.publisher = 'Canonical';
            os.offer = 'UbuntuServer';
            os.sku = '16.04.0-LTS';
            os.version = 'latest';
            os.osType = 'Linux';
            os.hasImage = true;
        } else if (osname === 'ubuntu12') {
            // Ubuntu 12 config
            os.publisher = 'Canonical';
            os.offer = 'UbuntuServer';
            os.sku = '12.04.5-LTS';
            os.version = 'latest';
            os.osType = 'Linux';
            os.hasImage = true;
        } else if (osname === 'centos6') {
            // Centos 6.8 config
            os.publisher = 'OpenLogic';
            os.offer = 'CentOS';
            os.sku = '6.8';
            os.version = 'latest';
            os.osType = 'Linux';
            os.hasImage = true;
        } else if (osname === 'centos7') {
            // Centos 6.8 config
            os.publisher = 'OpenLogic';
            os.offer = 'CentOS';
            os.sku = '7.2';
            os.version = 'latest';
            os.osType = 'Linux';
            os.hasImage = true;
        } else if (osname === 'redhat6') {
            // RHEL 6.8 config
            os.publisher = 'RedHat';
            os.offer = 'RHEL';
            os.sku = '6.8';
            os.version = 'latest';
            os.osType = 'Linux';
            os.hasImage = true;
        } else if (osname === 'redhat7') {
            // RHEL 7.2 config
            os.publisher = 'RedHat';
            os.offer = 'RHEL';
            os.sku = '7.2';
            os.version = 'latest';
            os.osType = 'Linux';
            os.hasImage = false;
        } else if (osname === 'win2012') {
            // Windows 2012R2 config
            os.publisher = 'MicrosoftWindowsServer';
            os.offer = 'WindowsServer';
            os.sku = '2012-R2-Datacenter';
            os.version = 'latest';
            os.osType = 'Windows';
            os.hasImage = false;
        } else if (osname === 'win2008') {
            // Windows 2008R2 config
            os.publisher = 'MicrosoftWindowsServer';
            os.offer = 'WindowsServer';
            os.sku = '2008-R2-SP1';
            os.version = 'latest';
            os.osType = 'Windows';
            os.hasImage = false;
        } else if (osname === 'win2016') {
            // Windows 2016 config
            os.publisher = 'MicrosoftWindowsServer';
            os.offer = 'WindowsServer';
            os.sku = '2016-Datacenter';
            os.version = 'latest';
            os.osType = 'Windows';
            os.hasImage = false;
        }
        return os;
    }

    getSubnetInfo(vnetName) {
        console.log('Getting subnet info for: ' + vnetName);
        return P.fromCallback(callback => this.networkClient.subnets.get(this.resourceGroupName, vnetName, 'default', callback));
    }

    getIpAddress(pipName) {
        console.log('Getting IP for: ' + pipName);
        return P.fromCallback(callback => this.networkClient.publicIPAddresses.get(this.resourceGroupName, pipName, callback))
            .then(res => res.ipAddress);
    }

    getPrivateIpAddress(networkInterfaceName, ipConfigurationName) {
        console.log('Getting IP for: ', networkInterfaceName, ipConfigurationName);
        return P.fromCallback(callback => this.networkClient.networkInterfaceIPConfigurations.get(
                this.resourceGroupName, networkInterfaceName, ipConfigurationName, callback
            ))
            .then(res => res.privateIPAddress);
    }

    createAgent({
        vmName,
        storage,
        vnet,
        os,
        vmSize = DEFAULT_VMSIZE,
        agentConf,
        serverIP,
        allocate_pip = false,
    }) {
        const osDetails = this.getImagesfromOSname(os);
        return this.getSubnetInfo(vnet)
            .then(subnetInfo => this.allocate_nic(subnetInfo, `${vmName}_pip`, `${vmName}_nic`, `${vmName}_ip`, allocate_pip))
            .then(nic => {
                console.log(`Network Interface ${vmName}_nic was created`);
                var image = {
                    publisher: osDetails.publisher,
                    offer: osDetails.offer,
                    sku: osDetails.sku,
                    version: 'latest'
                };
                let diskSizeGB = 40;
                if (osDetails.osType === 'Windows') {
                    diskSizeGB = 140;
                }
                return this.createVirtualMachine({
                    vmName,
                    nicId: nic.id,
                    imageReference: image,
                    storageAccountName: storage,
                    diskSizeGB,
                    vmSize
                });
            })
            .then(() => {
                if (allocate_pip) {
                    return this.getIpAddress(`${vmName}_pip`);
                } else {
                    return this.getPrivateIpAddress(`${vmName}_nic`, `${vmName}_ip`);
                }
            })
            .tap(ip => console.log(`${vmName} agent ip is: ${ip}`))
            .then(ip => {
                if (agentConf && serverIP) {
                    return this.createAgentExtension({
                        ip,
                        vmName,
                        storage,
                        vnet,
                        os: osDetails,
                        agentConf,
                        serverIP
                    });
                } else {
                    console.log(`Skipping creation of extension (agent installation), both ip ${serverIP} and 
                    agentConf ${agentConf === undefined ? 'undefined' : 'exists'} should be supplied`);
                    return ip;
                }
            });
    }

    // runAgentCommand(agent_server_ip, agentCommand) {
    //     let client;
    //     return ssh.ssh_connect({
    //         host: agent_server_ip,
    //         //  port: 22,
    //         username: QA_USER_NAME,
    //         password: ADMIN_PASSWORD,
    //         keepaliveInterval: 5000,
    //     })
    //         //becoming root and running the agent command
    //         .then(res => {
    //             client = res;
    //             return ssh.ssh_exec(client, `
    //                 sudo bash -c '${agentCommand}'
    //             `);
    //         })
    //         .then(() => ssh.ssh_stick(client));
    // }

    createLGFromImage(params) {
        const {
            vmName,
            vnet,
            storage,
            ipType = 'Dynamic',
            vmSize = DEFAULT_VMSIZE,
            CONTAINER_NAME = 'staging-vhds',
            location = IMAGE_LOCATION,
            allocate_pip = true
        } = params;
        return P.resolve()
            .then(() => this.copyVHD({
                image: 'LG.vhd',
                location
            }))
            .then(() => this.createVirtualMachineFromImage({
                vmName,
                image: 'https://' + storage + '.blob.core.windows.net/' + CONTAINER_NAME + '/LG.vhd',
                vnet,
                storageAccountName: storage,
                osType: 'Linux',
                ipType,
                diskSizeGB: 40,
                vmSize,
                allocate_pip
            }))
            .then(() => {
                if (allocate_pip) {
                    return this.getIpAddress(`${vmName}_pip`);
                } else {
                    return this.getPrivateIpAddress(`${vmName}_nic`, `${vmName}_ip`);
                }
            })
            .tap(ip => console.log(`${vmName} ip is: ${ip}`));
    }

    createAgentFromImage(params) {
        const {
            vmName,
            vnet,
            storage,
            server_ip,
            os,
            ipType = 'Dynamic',
            vmSize = DEFAULT_VMSIZE,
            CONTAINER_NAME = 'staging-vhds',
            location = IMAGE_LOCATION,
            exclude_drives = [],
            shouldInstall = false,
            allocate_pip = false
        } = params;
        let agentCommand;
        let agent_ip;
        const osType = this.getImagesfromOSname(os).osType;
        return P.resolve()
            .then(() => this.copyVHD({
                image: os + '.vhd',
                location
            }))
            .then(() => {
                let diskSizeGB;
                if (osType === 'Windows') {
                    diskSizeGB = 140;
                } else if (osType === 'Linux') {
                    diskSizeGB = 40;
                }
                return this.createVirtualMachineFromImage({
                    vmName,
                    image: 'https://' + storage + '.blob.core.windows.net/' + CONTAINER_NAME + '/' + os + '.vhd',
                    vnet,
                    storageAccountName: storage,
                    osType,
                    ipType,
                    diskSizeGB,
                    vmSize,
                    allocate_pip
                });
            })
            .delay(20 * 1000)
            .then(() => {
                if (allocate_pip) {
                    return this.getIpAddress(`${vmName}_pip`);
                } else {
                    return this.getPrivateIpAddress(`${vmName}_nic`, `${vmName}_ip`);
                }
            })
            .then(ip => {
                console.log(`${vmName} agent ip is: ${ip}`);
                agent_ip = ip;
                if (shouldInstall) {
                    return af.getAgentConfInstallString(server_ip, osType, exclude_drives)
                        .then(res => {
                            agentCommand = res;
                            console.log(agentCommand);
                            return af.runAgentCommandViaSsh(agent_ip, QA_USER_NAME, ADMIN_PASSWORD, agentCommand, osType);
                        });
                } else {
                    return agent_ip;
                }
            });
    }

    createAgentExtension(params) {
        const { vmName, os, serverIP, agentConf, ip } = params;
        let extension = {
            publisher: 'Microsoft.OSTCExtensions',
            virtualMachineExtensionType: 'CustomScriptForLinux', // it's a must - don't beleive Microsoft
            typeHandlerVersion: '1.5',
            autoUpgradeMinorVersion: true,
            settings: {
                fileUris: ['https://pluginsstorage.blob.core.windows.net/agentscripts/init_agent.sh'],
                commandToExecute: 'bash init_agent.sh ' + serverIP + ' ' + agentConf
            },
            protectedSettings: {
                storageAccountName: 'pluginsstorage',
                storageAccountKey: 'bHabDjY34dXwITjXEasmQxI84QinJqiBZHiU+Vc1dqLNSKQxvFrZbVsfDshPriIB+XIaFVaQ2R3ua1YMDYYfHw=='
            },
            location: this.location,
        };
        if (os.osType === 'Windows') {
            extension.publisher = 'Microsoft.Compute';
            extension.virtualMachineExtensionType = 'CustomScriptExtension';
            extension.typeHandlerVersion = '1.7';
            extension.settings = {
                fileUris: ['https://pluginsstorage.blob.core.windows.net/agentscripts/init_agent.ps1'],
                commandToExecute: 'powershell -ExecutionPolicy Unrestricted -File init_agent.ps1 ' + serverIP +
                    ' ' + agentConf
            };
        }
        return this.createVirtualMachineExtension(vmName, extension)
            .then(() => ip);
    }

    createWinSecurityExtension(vmName) {
        console.log('Createing IaaSAntimalware extantion');
        const extension = {
            publisher: "Microsoft.Azure.Security",
            virtualMachineExtensionType: 'IaaSAntimalware',
            typeHandlerVersion: '1.1',
            settings: {
                AntimalwareEnabled: 'true',
            },
            autoUpgradeMinorVersion: true,
            RealtimeProtectionEnabled: 'true',
            ScheduledScanSettings: {
                isEnabled: 'true',
                scanType: 'Quick',
                day: 7,
                time: 120
            },
            protectedSettings: null,
            location: this.location
        };
        return this.createVirtualMachineExtension(vmName, extension, 'WinSecurityExtension');
    }

    cloneVM(originalVM, newVmName, networkInterfaceName, ipConfigName, vnet, allocate_pip = true) {
        return this.getSubnetInfo(vnet)
            .then(subnetInfo => this.allocate_nic(subnetInfo, `${newVmName}_pip`, networkInterfaceName, ipConfigName, allocate_pip))
            .then(nicInfo => this.cloneVirtualMachine(originalVM, newVmName, nicInfo.id))
            .then(result => {
                console.log(result);
            });
    }

    createNIC(subnetInfo, networkInterfaceName, ipConfigName, publicIPInfo) {
        var nicParameters = {
            location: this.location,
            ipConfigurations: [{
                name: ipConfigName,
                privateIPAllocationMethod: 'Dynamic',
                subnet: subnetInfo,
                // publicIPAddress: publicIPInfo
            }]
        };
        if (publicIPInfo) {
            nicParameters.ipConfigurations[0].publicIPAddress = publicIPInfo;
            console.log(`Creating Network Interface: ${networkInterfaceName}, Using public IP`);
        } else {
            console.log(`Creating Network Interface: ${networkInterfaceName}`);
        }
        return P.fromCallback(callback => this.networkClient.networkInterfaces.createOrUpdate(this.resourceGroupName, networkInterfaceName,
            nicParameters, callback));
    }

    allocate_nic(subnetInfo, pipName, networkInterfaceName, ipConfigName, allocate_pip, ipType) {
        return P.resolve()
            .then(() => {
                if (allocate_pip) {
                    return this.createPublicIp(pipName, ipType)
                        .then(ipInfo => this.createNIC(subnetInfo, networkInterfaceName, ipConfigName, ipInfo));
                } else {
                    return this.createNIC(subnetInfo, networkInterfaceName, ipConfigName);
                }
            });
    }

    createPublicIp(publicIPName, ipType = 'Dynamic') {
        var publicIPParameters = {
            location: this.location,
            publicIPAllocationMethod: ipType,
            // dnsSettings: {
            //     domainNameLabel: domainNameLabel
            // }
        };

        console.log(`Creating ${ipType} public IP: ${publicIPName}`);
        return P.fromCallback(callback => this.networkClient.publicIPAddresses.createOrUpdate(this.resourceGroupName, publicIPName,
            publicIPParameters, callback));
    }

    findVMImage(os) {
        console.log(util.format('Finding a VM Image for location %s from ' +
            'publisher %s with offer %s and sku %s', this.location, os.publisher, os.offer, os.sku));
        return P.fromCallback(callback => this.computeClient.virtualMachineImages.list(this.location, os.publisher, os.offer, os.sku, {
            top: 1
        }, callback));
    }

    createVirtualMachine({
        vmName,
        nicId,
        imageReference,
        storageAccountName,
        diskSizeGB,
        vmSize = DEFAULT_VMSIZE,
    }) {
        if (!diskSizeGB) {
            throw new Error('must Enter disk size in GB');
        }
        var vmParameters = {
            location: this.location,
            // tags: {
            //     env: serverName,
            //     agent_conf: agentConf,
            // },
            osProfile: {
                computerName: vmName,
                adminUsername: ADMIN_USER_NAME,
                adminPassword: ADMIN_PASSWORD
            },
            hardwareProfile: {
                vmSize
            },
            storageProfile: {
                imageReference: imageReference,
                osDisk: {
                    name: vmName + '_disk',
                    diskSizeGB,
                    caching: 'None',
                    createOption: 'fromImage',
                    vhd: {
                        uri: 'https://' + storageAccountName + '.blob.core.windows.net/osdisks/' + vmName + '-os.vhd'
                    }
                },
            },
            networkProfile: {
                networkInterfaces: [{
                    id: nicId,
                    primary: true
                }]
            },
            diagnosticsProfile: {
                bootDiagnostics: {
                    enabled: true,
                    storageUri: 'https://wusdiagnostics.blob.core.windows.net/'
                }
            }
        };
        console.log('Creating Virtual Machine: ' + vmName);
        return P.fromCallback(callback => this.computeClient.virtualMachines.createOrUpdate(
                this.resourceGroupName, vmName, vmParameters, callback))
            .then(() => {
                if (imageReference.publisher === 'MicrosoftWindowsServer') {
                    return this.createWinSecurityExtension(vmName);
                }
            });
    }

    createVirtualMachineFromImage({
        vmName,
        image,
        vnet,
        storageAccountName,
        osType,
        plan,
        ipType = 'Dynamic',
        diskSizeGB,
        vmSize = DEFAULT_VMSIZE,
        allocate_pip = false,
    }) {
        console.log(arguments[0]);
        var vmParameters = {
            location: this.location,
            plan: plan,
            osProfile: {
                computerName: vmName,
                adminUsername: ADMIN_USER_NAME,
                adminPassword: ADMIN_PASSWORD
            },
            hardwareProfile: {
                vmSize
            },
            storageProfile: {
                osDisk: {
                    name: vmName + '_disk',
                    diskSizeGB,
                    caching: 'None',
                    createOption: 'fromImage',
                    osType,
                    vhd: {
                        uri: 'https://' + storageAccountName + '.blob.core.windows.net/osdisks/' + vmName + '-os.vhd'
                    },
                    image: {
                        uri: image
                    }
                },
            },
            networkProfile: {
                networkInterfaces: [{
                    primary: true
                }]
            },
            diagnosticsProfile: {
                bootDiagnostics: {
                    enabled: true,
                    storageUri: 'https://wusdiagnostics.blob.core.windows.net/'
                }
            }
        };
        return this.getSubnetInfo(vnet)
            .then(subnetInfo => this.allocate_nic(subnetInfo, `${vmName}_pip`, `${vmName}_nic`, `${vmName}_ip`, allocate_pip, ipType))
            .then(nic => {
                vmParameters.networkProfile.networkInterfaces[0].id = nic.id;
                return P.fromCallback(callback => this.computeClient.virtualMachines.createOrUpdate(this.resourceGroupName,
                    vmName, vmParameters, callback));
            })
            .then(() => {
                if (osType === 'Windows') {
                    return this.createWinSecurityExtension(vmName);
                }
            });
    }

    cloneVirtualMachine(origMachine, newMachine, nicId) {
        console.log('Cloning Virtual Machine: ' + origMachine);
        return P.fromCallback(callback => this.computeClient.virtualMachines.get(this.resourceGroupName, origMachine, callback))
            .then(machine_info => {
                var pos = machine_info.storageProfile.osDisk.vhd.uri.lastIndexOf('/');
                var new_vhd = machine_info.storageProfile.osDisk.vhd.uri.substring(0, pos) + '/' + newMachine + '-os.vhd';
                var vmParameters = {
                    location: machine_info.location,
                    plan: machine_info.plan,
                    osProfile: {
                        computerName: newMachine,
                        adminUsername: ADMIN_USER_NAME,
                        adminPassword: ADMIN_PASSWORD
                    },
                    hardwareProfile: machine_info.hardwareProfile,
                    storageProfile: {
                        osDisk: {
                            name: machine_info.storageProfile.osDisk.name,
                            // diskSizeGB: 1023,
                            caching: machine_info.storageProfile.osDisk.caching,
                            createOption: 'fromImage',
                            osType: machine_info.storageProfile.osDisk.osType,
                            vhd: {
                                uri: new_vhd
                            },
                            image: {
                                uri: machine_info.storageProfile.osDisk.vhd.uri
                            }
                        },
                    },
                    networkProfile: {
                        networkInterfaces: [{
                            id: nicId,
                            primary: true
                        }]
                    },
                    diagnosticsProfile: machine_info.diagnosticsProfile
                };
                return P.fromCallback(callback => this.computeClient.virtualMachines.createOrUpdate(this.resourceGroupName,
                    newMachine, vmParameters, callback));
            });
    }

    addDataDiskToVM({ vm, size, storage, number_of_disks = 1 }) {
        console.log(`Adding ${number_of_disks} data disks of size ${size} to Virtual Machine: ${vm}`);
        return P.fromCallback(callback => this.computeClient.virtualMachines.get(this.resourceGroupName, vm, callback))
            .then(machine_info => {
                if (!machine_info.storageProfile.dataDisks) {
                    machine_info.storageProfile.dataDisks = [];
                }
                var disk_number = machine_info.storageProfile.dataDisks.length;
                for (let i = 0; i < number_of_disks; i++) {
                    machine_info.storageProfile.dataDisks.push({
                        name: 'dataDisk' + (disk_number + (i + 1)),
                        diskSizeGB: size,
                        lun: disk_number + i,
                        vhd: {
                            uri: 'https://' + storage + '.blob.core.windows.net/datadisks/' + vm + '-data' + (disk_number + (i + 1)) + '.vhd'
                        },
                        createOption: 'Empty'
                    });
                }
                return P.fromCallback(callback => this.computeClient.virtualMachines.createOrUpdate(this.resourceGroupName,
                    vm, machine_info, callback));
            });
    }

    rescanDataDisksExtension(vm) {
        console.log('removing old extension (if exist)');
        return this.deleteVirtualMachineExtension(vm)
            .then(() => {
                var extension = {
                    publisher: 'Microsoft.OSTCExtensions',
                    virtualMachineExtensionType: 'CustomScriptForLinux', // it's a must - don't beleive Microsoft
                    typeHandlerVersion: '1.5',
                    autoUpgradeMinorVersion: true,
                    settings: {
                        fileUris: ['https://pluginsstorage.blob.core.windows.net/agentscripts/ddisk.sh'],
                        commandToExecute: 'bash -x ddisk.sh '
                    },
                    protectedSettings: {
                        storageAccountName: 'pluginsstorage',
                        storageAccountKey: 'bHabDjY34dXwITjXEasmQxI84QinJqiBZHiU+Vc1dqLNSKQxvFrZbVsfDshPriIB+XIaFVaQ2R3ua1YMDYYfHw=='
                    },
                    location: this.location,
                };
                if (vm.includes('Linux')) {
                    console.log('running new extension to mount disk to file system for Linux');
                } else {
                    extension.publisher = 'Microsoft.Compute';
                    extension.virtualMachineExtensionType = 'CustomScriptExtension';
                    extension.typeHandlerVersion = '1.7';
                    extension.settings = {
                        fileUris: ["https://pluginsstorage.blob.core.windows.net/agentscripts/ddisk.ps1"],
                        commandToExecute: 'powershell -ExecutionPolicy Unrestricted -File ddisk.ps1 '
                    };
                    console.log('running new extension to mount disk to file system for Windows');
                }
                return this.createVirtualMachineExtension(vm, extension);
            });
    }

    startVirtualMachine(vmName) {
        console.log('Starting Virtual Machine: ' + vmName);
        return P.fromCallback(callback => this.computeClient.virtualMachines.start(this.resourceGroupName, vmName, callback));
    }

    captureVirtualMachine(vmName, vhdname, container, overwrite) { // some kind of taking snapshot
        var snapshotParameters = {
            vhdPrefix: vhdname,
            destinationContainerName: container,
            overwriteVhds: overwrite
        };
        console.log('Capturing Virtual Machine: ' + vmName);
        console.log('Stopping Virtual Machine: ' + vmName);
        return P.fromCallback(callback => this.computeClient.virtualMachines.powerOff(
                this.resourceGroupName, vmName, callback))
            .tap(() => {
                console.log('Virtual Machine stopped');
                console.log('Generalizing Virtual Machine: ' + vmName);
            })
            .then(() => P.fromCallback(callback => this.computeClient.virtualMachines.generalize(
                this.resourceGroupName, vmName, callback)))
            .tap(res => {
                console.log('Virtual Machine generalized', res);
                console.log('capturing Virtual Machine: ' + vmName);
            })
            .then(res => P.fromCallback(callback => this.computeClient.virtualMachines.capture(
                this.resourceGroupName, vmName, snapshotParameters, callback)))
            .then(res => res.output.resources[0].properties.storageProfile.osDisk.image.uri);
    }

    startVirtualMachineFromVHD(vmName, vhdname) { // some kind of revert to snapshot
        console.log('Reverting Virtual Machine:', vmName);
        var machine_info;
        return P.fromCallback(callback => this.computeClient.virtualMachines.get(this.resourceGroupName, vmName, callback))
            .then(machine => {
                machine_info = machine;
                console.log('deleting machine:', vmName);
                return P.fromCallback(callback => this.computeClient.virtualMachines.deleteMethod(
                    this.resourceGroupName, vmName, callback));
            })
            .then(() => {
                var parts = machine_info.storageProfile.osDisk.vhd.uri.split('/');
                var container = parts[parts.length - 2];
                var vhd = parts[parts.length - 1];
                console.log('deleting blob:', vhd);
                return P.fromCallback(callback => blobSvc.deleteBlob(container, vhd, callback));
            })
            .then(() => {
                console.log(machine_info.plan);
                var vmParameters = {
                    location: machine_info.location,
                    plan: machine_info.plan,
                    osProfile: {
                        computerName: vmName,
                        adminUsername: ADMIN_USER_NAME,
                        adminPassword: ADMIN_PASSWORD
                    },
                    hardwareProfile: machine_info.hardwareProfile,
                    storageProfile: {
                        osDisk: {
                            name: machine_info.storageProfile.osDisk.name,
                            caching: machine_info.storageProfile.osDisk.caching,
                            createOption: 'fromImage',
                            osType: machine_info.storageProfile.osDisk.osType,
                            vhd: {
                                uri: machine_info.storageProfile.osDisk.vhd.uri
                            },
                            image: {
                                uri: vhdname
                            }
                        },
                    },
                    networkProfile: machine_info.networkProfile,
                    diagnosticsProfile: machine_info.diagnosticsProfile
                };
                console.log('starting machine from vhd for:', vmName);
                return P.fromCallback(callback => this.computeClient.virtualMachines.createOrUpdate(
                    this.resourceGroupName, vmName, vmParameters, callback));
            });
    }

    restartVirtualMachine(vmName) {
        console.log('Restarting Virtual Machine: ' + vmName);
        return P.fromCallback(callback => this.computeClient.virtualMachines.restart(
            this.resourceGroupName, vmName, callback));
    }

    stopVirtualMachine(vmName) {
        console.log('Stopping Virtual Machine: ' + vmName);
        return P.fromCallback(callback => this.computeClient.virtualMachines.powerOff(
            this.resourceGroupName, vmName, callback));
    }

    deleteVirtualMachine(vmName) {
        console.log('Deleting Virtual Machine: ' + vmName);
        return P.fromCallback(callback => this.computeClient.virtualMachines.deleteMethod(
                this.resourceGroupName, vmName, callback))
            .then(() => {
                console.log('Deleting ' + vmName + '_nic');
                return P.fromCallback(callback => this.networkClient.networkInterfaces.deleteMethod(
                    this.resourceGroupName, vmName + '_nic', callback));
            })
            .then(() => {
                console.log('Deleting ' + vmName + '_nic');
                return P.fromCallback(callback => this.networkClient.publicIPAddresses.deleteMethod(
                    this.resourceGroupName, vmName + '_pip', callback));
            })
            .then(() => P.fromCallback(callback => blobSvc.deleteBlob('osdisks', vmName + '-os.vhd', callback)))
            .then(() => P.fromCallback(callback => blobSvc.doesContainerExist('datadisks', callback)))
            .then(result => {
                if (result.exists) {
                    return P.fromCallback(callback => blobSvc.listBlobsSegmentedWithPrefix('datadisks', vmName, null, callback));
                }
            })
            .then(result => {
                if (result && result.entries && (result.entries.length > 0)) {
                    console.log('Deleting data disks', result.entries.map(entry => entry.name));
                    return P.map(result.entries, blob => P.fromCallback(
                        callback => blobSvc.deleteBlob('datadisks', blob.name, callback)));
                }
            });
    }

    deleteVMOsDisk(vmName) {
        console.log('Deleting OS Disk ' + vmName);
        return P.fromCallback(callback => blobSvc.deleteBlob('osdisks', vmName + '-os.vhd', callback));
    }

    deleteBlobDisks(vmName, container = 'datadisks') {
        console.log('Deleting data disks of:', vmName);
        return P.fromCallback(callback => blobSvc.listBlobsSegmentedWithPrefix(container, vmName, null, callback))
            .then(res => P.map(res.entries, disk => {
                console.log(`deleting: ${disk.name}`);
                return P.fromCallback(callback => blobSvc.deleteBlob(container, disk, callback))
                    .catch(() => true);
            }));
    }

    listVirtualMachinesBySuffix(suffix) {
        return P.fromCallback(callback => this.computeClient.virtualMachines.list(this.resourceGroupName, callback))
            .then(machines_in_rg => {
                var machines_with_string = [];
                return P.map(machines_in_rg, machine => {
                        if (machine.name.endsWith(suffix)) {
                            machines_with_string.push(machine.name);
                        }
                    })
                    .then(() => machines_with_string);
            });
    }

    listVirtualMachines(prefix, status) {
        return P.fromCallback(callback => this.computeClient.virtualMachines.list(this.resourceGroupName, callback))
            .then(machines_in_rg => {
                var machines_with_prefix = [];
                return P.map(machines_in_rg, machine => {
                        if (machine.name.startsWith(prefix)) {
                            if (status) {
                                return this.getMachineStatus(machine.name)
                                    .then(machine_status => {
                                        if (machine_status === status) {
                                            machines_with_prefix.push(machine.name);
                                        }
                                    });
                            }
                            machines_with_prefix.push(machine.name);
                        }
                    })
                    .then(() => machines_with_prefix);
            });
    }

    getRandomMachine(prefix, status) {
        return this.listVirtualMachines(prefix, status)
            .then(machines => {
                let rand = Math.floor(Math.random() * machines.length);
                return machines[rand];
            });
    }

    getMachineStatus(machine) {
        return P.fromCallback(callback => this.computeClient.virtualMachines.get(this.resourceGroupName, machine, {
                expand: 'instanceView',
            }, callback))
            .then(machine_info => {
                if (machine_info.instanceView.statuses[1]) {
                    return machine_info.instanceView.statuses[1].displayStatus;
                }
                return 'VM Failure';
            });
    }

    countOnMachines(prefix) {
        var count = 0;
        var index = 0;
        return this.listVirtualMachines(prefix)
            .then(machines => promise_utils.pwhile(() => index < machines.length, () => {
                index += 1;
                this.getMachineStatus(machines[index]).then(state => {
                    if (state === 'VM running') {
                        count += 1;
                    }
                });
            }))
            .then(() => count);
    }

    waitMachineState(machine, state) {
        var c_state;
        console.log('Waiting for machine state to be ' + state);
        return promise_utils.pwhile(() => c_state !== state,
            () => P.fromCallback(callback => this.computeClient.virtualMachines.get(this.resourceGroupName, machine, {
                expand: 'instanceView',
            }, callback))
            .then(machine_info => {
                if (machine_info.instanceView.statuses[1]) {
                    c_state = machine_info.instanceView.statuses[1].displayStatus;
                }
                console.log('Current state is: ' + c_state + ' waiting for: ' + state + ' - will wait for extra 5 seconds');
            })
            .delay(5000)
        );
    }

    createVirtualMachineExtension(vmName, extensionParameters, extensionName = `${vmName}_ext`) {
        console.log('Running Virtual Machine Desired extension');
        return P.fromCallback(callback => this.computeClient.virtualMachineExtensions.createOrUpdate(this.resourceGroupName, vmName,
            extensionName, extensionParameters, callback));
    }

    deleteVirtualMachineExtension(vmName) {
        console.log('Deleting Virtual Machine Desired extension');
        return P.fromCallback(callback => this.computeClient.virtualMachineExtensions.deleteMethod(this.resourceGroupName, vmName,
            vmName + '_ext', callback));
    }

    //copyVHD will copy the relevant VHD if it doesnt exsist
    copyVHD(params) {
        const { image, CONTAINER_NAME = 'staging-vhds', location = IMAGE_LOCATION } = params;
        const NOOBAA_IMAGE = location + CONTAINER_NAME + '/' + image;
        // const image_preffix = image.split('-')[0];
        var isDone = false;
        // check if the containar exsist 
        return P.fromCallback(callback => blobSvc.doesContainerExist(CONTAINER_NAME, callback))
            //if the container doesnt exist create it
            .then(({ exists }) => !exists && P.fromCallback(callback => blobSvc.createContainer(CONTAINER_NAME, callback)))
            //copy the image (blob) if it doesn't exsist
            .then(() => P.fromCallback(callback => blobSvc.doesBlobExist(CONTAINER_NAME, image, callback)))
            .then(({ exists }) => !exists && P.fromCallback(
                    callback => blobSvc.startCopyBlob(NOOBAA_IMAGE, CONTAINER_NAME, image, callback))
                .then(() => promise_utils.pwhile(() => !isDone,
                    () => P.fromCallback(callback => blobSvc.getBlobProperties(CONTAINER_NAME, image, callback))
                    .then(result => {
                        if (result.copy) {
                            console.log('Copying Image...', result.copy.progress);
                            if (result.copy.status === 'success') {
                                isDone = true;
                            } else if (result.copy.status !== 'pending') {
                                throw new Error('got wrong status while copying', result.copy.status);
                            }
                        }
                    })
                    .delay(10 * 1000)
                )));
    }

    // creates new noobaa server and returns it's secret if system was created
    createServer(params) {
        const {
            serverName,
            vnet,
            storage,
            ipType = 'Dynamic',
            vmSize = DEFAULT_VMSIZE,
            CONTAINER_NAME = 'staging-vhds',
            location = IMAGE_LOCATION,
            latesetRelease = true,
            createSystem = false,
            updateNTP = false,
            allocate_pip = true
        } = params;
        let { imagename } = params;
        let rpc;
        let client;
        let secret;
        return P.resolve()
            .then(() => {
                if (imagename) {
                    console.log(`using image ${imagename} as base server image`);
                    return P.resolve();
                } else {
                    return fs.readFileAsync('src/deploy/version_map.json')
                        .then(buf => {
                            const ver_map = JSON.parse(buf.toString());
                            if (latesetRelease) {
                                imagename = ver_map.versions[_.findLastIndex(ver_map.versions, obj => obj.released === true)].vhd;
                            } else {
                                imagename = ver_map.versions[ver_map.versions.length - 1].vhd;
                            }
                            console.log(`using image ${imagename} as base server image`);
                        });
                }
            })
            .then(() => this.copyVHD({
                image: imagename,
                location
            }))
            .then(() => this.createVirtualMachineFromImage({
                vmName: serverName,
                image: 'https://' + storage + '.blob.core.windows.net/' + CONTAINER_NAME + '/' + imagename,
                vnet,
                storageAccountName: storage,
                osType: 'Linux',
                ipType,
                vmSize,
                allocate_pip
            }))
            .delay(20000)
            .then(() => this.getIpAddress(`${serverName}_pip`))
            .tap(ip => console.log(`server name: ${serverName}, ip: ${ip}`))
            .tap(ip => ops.wait_for_server(ip).timeout(10 * 60 * 1000 * 1000))
            .then(ip => {
                if (createSystem) {
                    rpc = api.new_rpc('wss://' + ip + ':8443');
                    rpc.disable_validation();
                    client = rpc.new_client({});
                    return client.system.create_system(system)
                        .then(res => {
                            client.options.auth_token = res.token;
                            return client.system.read_system({});
                        })
                        .then(res => {
                            secret = res.cluster.master_secret;
                            if (updateNTP) {
                                console.log('System created successfully, setting NTP');
                                return client.cluster_server.update_time_config({
                                        target_secret: secret,
                                        timezone: TZ,
                                        ntp_server: NTP
                                    })
                                    .then(() => rpc.disconnect_all());
                            } else {
                                console.log('System created successfuly');
                                return P.resolve();
                            }
                        });
                } else {
                    console.log('Skipping system creation');
                    return P.resolve();
                }
            })
            .then(() => {
                console.log('Server', serverName, 'was successfuly created');
                return secret;
            })
            .catch(err => {
                console.log('failed create server with', err);
                if (rpc) rpc.disconnect_all();
                throw err;
            });
    }

    addServerToCluster(master_ip, slave_ip, slave_secret, slave_name) {
        var rpc = api.new_rpc('wss://' + master_ip + ':8443');
        var client = rpc.new_client({});
        return P.fcall(() => {
                var auth_params = {
                    email: 'demo@noobaa.com',
                    password: 'DeMo1',
                    system: 'demo'
                };
                return client.create_auth_token(auth_params);
            })
            .then(() => client.cluster_server.add_member_to_cluster({
                address: slave_ip,
                secret: slave_secret,
                role: 'REPLICA',
                shard: 'shard1',
                new_hostname: slave_name
            }))
            .tap(() => {
                console.log(`the master ip is: ${master_ip}`);
                console.log(`sleeping for 5 min then adding ${slave_ip} to the cluster`);
            })
            .delay(5 * 60 * 1000)
            .then(() => {
                let should_run = true;
                const WAIT_INTERVAL = 10 * 1000;
                const limit = Date.now() + (3 * 60 * 1000);
                return promise_utils.pwhile(
                    () => should_run,
                    () => client.system.read_system({})
                    .then(res => {
                        const { servers } = res.cluster.shards[0];
                        should_run = servers.every(srv => srv.address !== slave_ip) && Date.now() < limit;
                        return P.delay(should_run ? WAIT_INTERVAL : 0);
                    })
                    .catch(err => console.log(`Caught ${err}, supressing`))
                );
            })
            .tap(() => console.log(`successfully added server ${slave_ip} to cluster, with master ${master_ip}`))
            .finally(() => rpc.disconnect_all());
    }
}

module.exports = AzureFunctions;
