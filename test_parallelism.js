import cluster from 'cluster';
import os from 'os';
const numCPUs = os.cpus().length;
console.log(`Number of CPU cores: ${numCPUs}`);
if (cluster.isPrimary) {
  console.log(`Master ${process.pid} is running`);

  // Fork workers.
  for (let i = 0; i < numCPUs; i++) {
    cluster.fork();
  }
  cluster.on('message', (worker, message) => {
    console.log(`Worker ${worker.process.pid} sent a message to the master process: ${message.msg}`);
  });
  cluster.on('exit', (worker, code, signal) => {
    console.log(`Worker ${worker.process.pid} died with code: ${code}, signal: ${signal}`);
  });
} else {
  // Workers can share any TCP connection
  // In this case it is an HTTP server

  console.log(`Worker ${process.pid} started`);

  // Simulate a server that takes time to respond
  setInterval(() => {
    console.log(`Worker ${process.pid} is processing a request...`);
    process.send({ msg: 'Request processed' }); // Send a message to the master process
    process.exit(0); // Simulate worker exiting after processing a request
  }, 1000);
}