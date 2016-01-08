#### Under Construction

To test out the use:

Requires a CouchDB database for syncing to remote

System 1:
```
node run.js
```

System 2:
```
node runB.js
```

Try killing the `master` node and observe how the other node gets promoted as the master node.


#### Work left:
  *   Polish Code
  *   Master selection policy
  *   Clean up
  *   Tests