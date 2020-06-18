import React, { useState, useEffect } from "react";
import { api, useApi } from "api";
import { withToastNoThrow } from "components/toast/Toast";
import { PortMapping } from "types";
// Components
import Card from "components/Card";
import TableInputs from "components/TableInputs";
import Button from "components/Button";
// Utils
import { shortNameCapitalized } from "utils/format";
import { MdAdd } from "react-icons/md";
// Style
import "./ports.scss";
import { PackageContainer } from "common";

const maxPortNumber = 32768 - 1;

export default function Ports({
  id,
  ports: portsFromDnp
}: {
  id: string;
  ports: PortMapping[];
}) {
  const [ports, setPorts] = useState<PortMapping[]>(portsFromDnp);
  const [updating, setUpdating] = useState(false);
  useEffect(() => {
    // Shallow copy since sort mutates the original array
    setPorts(
      [...(portsFromDnp || [])]
        .filter(({ host }) => host)
        .sort((a, b) => a.container - b.container)
        .sort((a, b) =>
          a.deletable && !b.deletable ? 1 : !a.deletable && b.deletable ? -1 : 0
        )
    );
  }, [portsFromDnp]);

  // Fetch current list of packages to check which ports are already used
  const dnpInstalled = useApi.packagesGet();
  const hostPortMapping = getHostPortMappings(dnpInstalled.data || []);

  async function onUpdateEnvsSubmit() {
    setUpdating(true);
    await withToastNoThrow(
      () => api.packageSetPortMappings({ id, portMappings: ports }),
      {
        message: `Updating ${shortNameCapitalized(id)} port mappings...`,
        onSuccess: `Updated ${shortNameCapitalized(id)} port mappings`
      }
    );
    setUpdating(false);
  }

  function addNewPort() {
    const newPort: PortMapping = {
      container: 8000,
      protocol: "TCP",
      deletable: true
    };
    setPorts(ps => [...ps, newPort]);
  }

  function editPort(i: number, data: Partial<PortMapping>) {
    setPorts(ps =>
      ps.map((p, _i): PortMapping => (i === _i ? { ...p, ...data } : p))
    );
  }

  function removePort(i: number) {
    setPorts(ps =>
      ps.filter(({ deletable }, _i) => {
        return _i !== i || !deletable;
      })
    );
  }

  function getDuplicatedContainerPort() {
    const existingPorts = new Set<string>();
    for (const { container, protocol } of ports) {
      if (container) {
        const key = `${container}-${protocol}`;
        if (existingPorts.has(key)) return { container, protocol };
        else existingPorts.add(key);
      }
    }
    return null;
  }

  function getDuplicatedHostPort() {
    const existingPorts = new Set<string>();
    for (const { host, protocol } of ports) {
      if (host) {
        const key = `${host}-${protocol}`;
        if (existingPorts.has(key)) return { host, protocol };
        else existingPorts.add(key);
      }
    }
    return null;
  }

  function getConflictingPort() {
    for (const { host, protocol } of ports) {
      const owner = hostPortMapping[`${host}/${protocol}`];
      if (owner && owner !== id) return { host, protocol, owner };
    }
  }

  function getPortOverTheMax() {
    return ports.find(
      ({ container, deletable }) => deletable && container > maxPortNumber
    );
  }

  const areNewMappingsInvalid = ports.some(
    ({ container, protocol, deletable }) =>
      deletable && (!container || !protocol)
  );
  const duplicatedContainerPort = getDuplicatedContainerPort();
  const duplicatedHostPort = getDuplicatedHostPort();
  const conflictingPort = getConflictingPort();
  const portOverTheMax = getPortOverTheMax();

  const thereAreNewPorts = ports.some(({ deletable }) => deletable);
  const arePortsTheSame = portsToId(portsFromDnp) === portsToId(ports);

  // Aggregate error messages as an array of strings
  const errors: string[] = [];
  if (duplicatedHostPort)
    errors.push(
      `Duplicated mapping for host port ${duplicatedHostPort.host}/${duplicatedHostPort.protocol}. Each host port can only be mapped once.`
    );

  if (duplicatedContainerPort)
    errors.push(
      `Duplicated mapping for package port ${duplicatedContainerPort.container}/${duplicatedContainerPort.protocol}. Each package port can only be mapped once.`
    );

  if (conflictingPort)
    errors.push(
      `Port ${conflictingPort.host}/${
        conflictingPort.protocol
      } is already mapped by the DAppNode Package ${shortNameCapitalized(
        conflictingPort.owner
      )}`
    );

  if (portOverTheMax)
    errors.push(
      `Port mapping ${portOverTheMax.container}/${portOverTheMax.protocol} is in the ephemeral port range (32768-65535). It must be avoided.`
    );

  // Aggregate conditions to disable the update
  const disableUpdate = Boolean(
    areNewMappingsInvalid ||
      duplicatedContainerPort ||
      duplicatedHostPort ||
      conflictingPort ||
      portOverTheMax ||
      arePortsTheSame ||
      updating
  );

  return (
    <Card spacing className="ports-editor">
      <TableInputs
        headers={[
          "Host port",
          "Package port number",
          "Protocol",
          ...(thereAreNewPorts ? [""] : [])
        ]}
        numOfRows={3}
        rowsTemplate={
          thereAreNewPorts
            ? "auto auto minmax(min-content, max-content) min-content"
            : "auto auto minmax(min-content, max-content)"
        }
        content={[
          ...ports.map(({ host, container, protocol, deletable }, i) => [
            {
              placeholder: "Ephemeral port if unspecified",
              value: host || "",
              onValueChange: (value: string) =>
                editPort(i, { host: parseInt(value) || undefined })
            },

            deletable
              ? {
                  placeholder: "enter container port...",
                  value: container,
                  onValueChange: (value: string) =>
                    editPort(i, { container: parseInt(value) || undefined })
                }
              : { lock: true, value: container },

            deletable
              ? {
                  select: true,
                  options: ["TCP", "UDP"],
                  value: protocol,
                  onValueChange: (value: string) =>
                    editPort(i, { protocol: value === "UDP" ? "UDP" : "TCP" })
                }
              : { lock: true, value: protocol },

            ...(thereAreNewPorts
              ? [
                  deletable
                    ? { deleteButton: true, onClick: () => removePort(i) }
                    : { empty: true }
                ]
              : [])
          ])
        ]}
      />

      {errors.map(error => (
        <div className="error" key={error}>
          {error}
        </div>
      ))}

      <div className="button-row">
        <Button
          variant={"dappnode"}
          onClick={onUpdateEnvsSubmit}
          disabled={disableUpdate}
        >
          Update port mappings
        </Button>

        <Button className="add-button" onClick={addNewPort}>
          <MdAdd />
        </Button>
      </div>
    </Card>
  );
}

/**
 * Convert a port mapping into a unique deterministic ID
 * @param portMappings
 */
function portsToId(portMappings: PortMapping[]): string {
  return portMappings
    .map(({ host, container, protocol }) =>
      [host, container, protocol].join("")
    )
    .join("");
}

/**
 * Util: Returns object ready to check if a port is used or not
 * @return
 * ```
 * hostPortMappings = { "8080/TCP": "bitcoin.dnp.dappnode.eth" }
 * ```
 */
function getHostPortMappings(dnps: PackageContainer[]) {
  const hostPortMappings: { [portId: string]: string } = {};
  for (const dnp of dnps)
    for (const port of dnp.ports || [])
      if (port.host)
        hostPortMappings[`${port.host}/${port.protocol}`] = dnp.name;
  return hostPortMappings;
}