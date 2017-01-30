<?php
/**
 * Created by PhpStorm.
 * User: gkoli
 * Date: 1/27/17
 * Time: 2:07 PM
 */
use google\appengine\api\taskqueue\PushTask;
use google\appengine\api\taskqueue\PushQueue;

if(FALSE && $_SERVER['REQUEST_METHOD'] !== 'POST') {
  http_response_code(500);
  exit;
}

$developer_stats = [];
$org = $_REQUEST['org'];
$developer = $_REQUEST['developer'];
//foreach($_REQUEST['orgs'] as $org) {
  $time = time();
  $curl = curl_init( 'https://api.enterprise.apigee.com/v1/o/' . $org . '/developers/' + $developer);
  $headers = [
    'Accept: application/json',
    'Authorization: Basic ' . base64_encode('gitesh@gkoli.info:p0o9i8U7'),
  ];

  $options = [
    CURLOPT_HTTPHEADER => $headers,
    CURLOPT_RETURNTRANSFER => true,
  ];
  curl_setopt_array($curl, $options);
  $start = microtime(true);
  $result = curl_exec($curl);
  $time_elapsed_secs = microtime(true) - $start;
  $obj = json_decode($result);
  $developer_stats[$org] = ['count' => isset($obj->mail) && ($obj->mail == $developer) ? 1 : 0, 'total_time' => $time_elapsed_secs, 'timestamp' => $time];

  foreach($obj->apps as $app){
    $task = new PushTask('/analytics/individual_developer_apps', ['org' => $org, 'developer' => $developer, 'app' => $app], ['method' => 'POST']);
    $queue = new PushQueue("get-individual-developer-apps");
    $queue->addTasks([$task]);
  }
//}

$conn = new pdo('mysql:unix_socket=/cloudsql/apigee-aggregator:us-central1:aggregator;dbname=analytics_db', 'root', '');

foreach($developer_stats as $org => $info) {
  $query = "INSERT INTO analytics values('{$org}', 'individual_developers', {$info['timestamp']}, $developer, '', {$info['total_time']}, {$info['count']})";
  $conn->query($query);
}
http_response_code(200);
exit;