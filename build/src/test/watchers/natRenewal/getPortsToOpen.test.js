const proxyquire = require("proxyquire");
const expect = require("chai").expect;

// module.exports = {
//     load: loadEnvs,
//     write: writeEnvs,
//     getManifestEnvs,
//   };

describe("Watchers > natRenewal > getPortsToOpen", () => {
  it("Return portsToOpen on a normal case", async () => {
    const stoppedDnp = "stopped.dnp.dappnode.eth";
    const getPortsToOpen = proxyquire("watchers/natRenewal/getPortsToOpen", {
      "modules/dockerList": {
        listContainers: async () => [
          {
            isCore: true,
            name: "admin.dnp.dappnode.eth",
            ports: [{ PublicPort: 8090, Type: "tcp" }],
            running: true
          },
          {
            isCore: true,
            name: "vpn.dnp.dappnode.eth",
            ports: [{ PublicPort: 1194, Type: "udp" }],
            running: true
          },
          {
            isCore: true,
            name: "vpn.dnp.dappnode.eth2",
            ports: [{ PublicPort: 1194, Type: "udp" }],
            running: true
          },
          {
            isCore: false,
            name: "goerli.dnp.dappnode.eth",
            ports: [
              { PublicPort: 32769, Type: "tcp" },
              { PublicPort: 32771, Type: "udp" },
              { PublicPort: 32770, Type: "udp" }
            ],
            running: true,
            portsToClose: [
              { portNumber: 32769, Type: "TCP" },
              { portNumber: 32771, Type: "UDP" },
              { portNumber: 32770, Type: "UDP" }
            ]
          },
          {
            isCore: false,
            name: stoppedDnp,
            running: false,
            portsToClose: [{ portNumber: 30303, protocol: "UDP" }]
          }
        ]
      },
      "utils/parse": {
        dockerComposePorts: dockerComposePath => {
          if (dockerComposePath.includes(stoppedDnp))
            return [
              { host: 4001, container: 4001, protocol: "udp" },
              { host: 4001, container: 4001, protocol: "tcp" }
            ];
          else throw Error(`Unknown dockerComposePath "${dockerComposePath}"`);
        }
      }
    });

    const portsToOpen = await getPortsToOpen();
    expect(portsToOpen).to.deep.equal([
      // From "admin.dnp.dappnode.eth"
      { protocol: "TCP", portNumber: 8090 },
      // From  "vpn.dnp.dappnode.eth"
      { protocol: "UDP", portNumber: 1194 },
      // From "goerli.dnp.dappnode.eth"
      { protocol: "TCP", portNumber: 32769 },
      { protocol: "UDP", portNumber: 32771 },
      { protocol: "UDP", portNumber: 32770 },
      // From "stopped.dnp.dappnode.eth"
      { protocol: "UDP", portNumber: 4001 },
      { protocol: "TCP", portNumber: 4001 }
    ]);
  });

  it("Return default ports if portsToOpen throws", async () => {
    const defaultPortsToOpen = require("watchers/natRenewal/defaultPortsToOpen");
    const getPortsToOpen = proxyquire("watchers/natRenewal/getPortsToOpen", {
      "modules/dockerList": {
        listContainers: () => {
          throw Error("Demo Error for listContainers");
        }
      },
      "utils/parse": {
        dockerComposePorts: () => {}
      }
    });

    const portsToOpen = await getPortsToOpen();
    expect(portsToOpen).to.deep.equal(defaultPortsToOpen);
  });

  it("Ignore a DNP if it throws fetching it's docker-compose", async () => {
    const throwsDnp = "throws.dnp.dappnode.eth";
    const getPortsToOpen = proxyquire("watchers/natRenewal/getPortsToOpen", {
      "modules/dockerList": {
        listContainers: async () => [
          {
            isCore: true,
            name: "admin.dnp.dappnode.eth",
            ports: [{ PublicPort: 8090, Type: "tcp" }],
            running: true
          },
          {
            name: throwsDnp,
            running: false
          }
        ]
      },
      "utils/parse": {
        dockerComposePorts: dockerComposePath => {
          if (dockerComposePath === `dnp_repo/${throwsDnp}/docker-compose.yml`)
            throw Error(`Demo Error for ${throwsDnp}`);
          else throw Error(`Unknown dockerComposePath "${dockerComposePath}"`);
        }
      }
    });

    const portsToOpen = await getPortsToOpen();
    expect(portsToOpen).to.deep.equal([
      // Should return only the admin's ports and ignore the other DNP's
      // From "admin.dnp.dappnode.eth"
      { protocol: "TCP", portNumber: 8090 }
    ]);
  });
});