/* global angular */
'use strict';

var _ = require('lodash');
var util = require('util');
var moment = require('moment');
var mgmt_api = require('../api/mgmt_api');
var mgmt_client = new mgmt_api.Client({
    path: '/api/mgmt_api/',
});

var ng_app = angular.module('ng_app', [
    'ng_util',
    'ngRoute',
    'ngCookies',
    'ngAnimate',
    'ngSanitize',
    'ngTouch',
]);

require('./ng_nodes');
require('./ng_files');


ng_app.config(['$routeProvider', '$locationProvider',
    function($routeProvider, $locationProvider) {
        $locationProvider.html5Mode(true);
        $routeProvider.when('/', {
            templateUrl: 'status.html',
        }).when('/nodes', {
            templateUrl: 'nodes.html',
        }).when('/files', {
            templateUrl: 'files.html',
        }).otherwise({
            redirectTo: '/'
        });
    }
]);


ng_app.controller('AppCtrl', [
    '$scope', '$http', '$q', '$window', 'nbMgmt', 'nbNodes', 'nbFiles',
    function($scope, $http, $q, $window, nbMgmt, nbNodes, nbFiles) {
        $scope.nbMgmt = nbMgmt;
        $scope.nbNodes = nbNodes;
        $scope.nbFiles = nbFiles;

        $scope.nav = {
            root: '/app/'
        };
    }
]);


ng_app.controller('StatusCtrl', [
    '$scope', '$http', '$q', '$window', '$timeout',
    function($scope, $http, $q, $window, $timeout) {
        $scope.nav.crumbs = [];
        $scope.nbMgmt.refresh_status();
        $scope.nbNodes.refresh_nodes();
    }
]);


ng_app.factory('nbMgmt', [
    '$q', '$timeout',
    function($q, $timeout) {
        var $scope = {};
        $scope.refresh_status = refresh_status;
        refresh_status();

        function refresh_status() {
            if ($scope.refreshing) {
                return;
            }
            $scope.refreshing = true;
            return $q.when(mgmt_client.system_stats()).then(
                function(res) {
                    console.log('STATS', res);
                    $scope.stats = res;
                    return $timeout(function() {
                        $scope.refreshing = false;
                    }, 500);
                },
                function(err) {
                    console.error('STATS FAILED', err);
                    return $timeout(function() {
                        $scope.refreshing = false;
                    }, 500);
                }
            );
        }

        return $scope;
    }
]);
