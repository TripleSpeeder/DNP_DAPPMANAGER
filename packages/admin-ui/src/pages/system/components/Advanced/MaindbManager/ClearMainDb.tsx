import React from "react";
import { api } from "api";
import Button from "components/Button";
import { confirm } from "components/ConfirmDialog";
import { withToast } from "components/toast/Toast";

export default function ClearMainDb() {
  async function cleanDb() {
    try {
      await new Promise<void>(resolve =>
        confirm({
          title: `Deleting database`,
          text: `This action cannot be undone. You should only clean the database in response to a problem.`,
          label: "Clean database",
          onClick: resolve
        })
      );

      await withToast(() => api.cleanDb(), {
        message: "Cleaning database...",
        onSuccess: "Cleaning database..."
      });
    } catch (e) {
      console.error("Error on cleanDb", e);
    }
  }
  return (
    <>
      <p>
        Remove the local database which contains critical information about your
        DAppNode, such as the dyndns identity, Ips registry, telegram
        configuration and more
      </p>

      <Button onClick={cleanDb}>Clean database</Button>
    </>
  );
}