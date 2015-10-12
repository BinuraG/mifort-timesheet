/*!
 * Copyright 2015 mifort.org
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

'use strict';

angular.module('myApp.timelog', ['ngRoute'])

    .config(['$routeProvider', function($routeProvider) {
        $routeProvider.when('/timelog', {
            templateUrl: 'timelog/timelogView.html',
            controller: 'timelogController'
        });
    }])

    .controller('timelogController', ['$scope', '$filter', 'timelogService', 'timesheetManagementService', 'preferences', function($scope, $filter, timelogService, timesheetManagementService, preferences) {
        $scope.projects = [];
        $scope.isCollapsed = false;
        $scope.timelogKeys = timelogService.getTimelogKeys();
        $scope.assignments = preferences.get('user').assignments;

        $scope.assignments.forEach(function(assignment, index) {
            timelogService.getProject(assignment.projectId).success(function(project) {
                if(project && project.active) {
                    project.userTimelogs = [];
                    project.currentTimelogIndex = 0;
                    $scope.projects.push(project);
                }
            }).then(function(data) {
                var currentProject = data.data;

                if(currentProject && currentProject.active) {
                    var startDate = currentProject.periods[0].start,
                        endDate = currentProject.periods[currentProject.periods.length - 1].end;

                    timelogService.getTimelog(preferences.get('user')._id, currentProject._id, startDate, endDate).success(function(projectTimelog) {
                        var projectUserTimelogs = currentProject.userTimelogs;

                        projectUserTimelogs.push.apply(projectUserTimelogs, projectTimelog.timelog);

                        if($scope.assignments.length == index + 1) {
                            $scope.init();
                        }
                    });
                }
            });
        });

        $scope.init = function() {
            $scope.projects.forEach(function(project, projectIndex) {
                var typingTimer = null,
                    startDate = moment(new Date(project.periods[0].start)),
                    endDate = moment(new Date(project.periods[project.periods.length - 1].end)),
                    daysToGenerate = endDate.diff(startDate, 'days');

                project.timelog = [];
                project.splittedTimelog = [];

                //template timelogs
                for (var i = 0; i < daysToGenerate + 1; i++) {
                    var dayToPush;

                    project.template.workload = preferences.get('user').workload;
                    project.template.userId = preferences.get('user')._id;
                    project.template.projectId = project._id;
                    project.template.projectName = project.name;

                    dayToPush = _.clone(project.template);
                    dayToPush.date = angular.copy(startDate).add(i, 'days').format("MM/DD/YYYY");
                    dayToPush.isFirstDayRecord = true;

                    project.timelog.push(dayToPush);
                }

                //timelogs data from timesheet
                if(project.defaultValues) {
                    project.defaultValues.forEach(function(day) {
                        var dayExisted = _.findWhere(project.timelog, {date: moment(new Date(day.date)).format("MM/DD/YYYY")});
                        if(dayExisted) {
                            angular.extend(dayExisted, day);
                        }
                    });
                }

                //user timelogs
                project.userTimelogs.forEach(function(day, index) {
                    var timelogDayIndex = _.findIndex(project.timelog, {date: moment(new Date(day.date)).format("MM/DD/YYYY")});
                    day.isFirstDayRecord = false;

                    //if current iterated log is not the first for this date to push
                    if(project.userTimelogs[index - 1] && project.userTimelogs[index - 1].date == day.date) {
                        project.timelog.splice(timelogDayIndex + 1, 0, day);
                    }
                    else {
                        day.isFirstDayRecord = true;
                        angular.extend(_.findWhere(project.timelog, {date: day.date}), day);
                    }
                });

                $scope.timelogAssigments = preferences.get('user').assignments.map(function(assignment) {
                    return assignment.role
                });

                splitPeriods(project);

                $scope.$watch('projects[' + projectIndex + ']', function(newValue, oldValue) {
                    if(newValue && newValue.timelog != oldValue.timelog && newValue.timelog.length >= oldValue.timelog.length) {
                        clearTimeout(typingTimer);

                        typingTimer = setTimeout(function() {
                            timelogService.updateTimelog(preferences.get('user')._id, newValue.timelog).success(function(data) {

                                _.map(newValue.timelog, function(day, index) {
                                    if(!day._id && data.timelog[index]) {
                                        day._id = data.timelog[index]._id
                                    }
                                });
                            });
                        }, 500)
                    }
                }, true);
            });
        };

        function splitPeriods(project) {
            project.splittedTimelog = [];
            project.periods.forEach(function(period) {
                var timelogPeriod,
                    startIndex = _.findIndex(project.timelog, {date: moment(new Date(period.start)).format("MM/DD/YYYY")}),
                    endIndex = _.findLastIndex(project.timelog, {date: moment(new Date(period.end)).format("MM/DD/YYYY")});

                timelogPeriod = project.timelog.slice(startIndex, endIndex + 1);
                project.splittedTimelog.push(timelogPeriod);
            });
        }

        $scope.addRow = function(log, project) {
            var newRow = angular.copy(project.template),
                dayIndex = _.findIndex(project.timelog, {_id: log._id});
            newRow.date = log.date;
            newRow.isNotFirstDayRecord = true;
            project.timelog.splice(dayIndex + 1, 0, newRow);
            splitPeriods(project);
        };

        $scope.removeRow = function(log, dayIndex, project) {
            if(log._id) {
                timelogService.removeTimelog(log).success(function() {
                        project.splittedTimelog[project.currentTimelogIndex].splice(dayIndex, 1);
                        //project.timelog.splice(dayIndex, _.findIndex(project.timelog, {$$hashKey: log.$$hashKey}));
                        project.timelog.splice(dayIndex, 1);
                        splitPeriods(project);
                    }
                );
            }
        };

        $scope.isWeekend = function(date) {
            return new Date(date).getDay() == 0 || new Date(date).getDay() == 1;
        };

        $scope.showPreviousPeriod = function(project) {
            project.currentTimelogIndex--;
        };

        $scope.showNextPeriod = function(project) {
            project.currentTimelogIndex++;
        };
    }]);